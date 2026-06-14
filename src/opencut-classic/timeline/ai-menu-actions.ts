import { apiClient } from "@/api/client";
import type { EditorCore } from "@/opencut-classic/core";
import type { MediaAsset } from "@/opencut-classic/media/types";
import {
  collectAudioElements,
  createAudioContext,
} from "@/opencut-classic/media/audio";
import { processMediaAssets } from "@/opencut-classic/media/processing";
import {
  buildElementFromMedia,
  buildTextElement,
  hasMediaId,
} from "@/opencut-classic/timeline/element-utils";
import type {
  TimelineElement,
  TimelineTrack,
} from "@/opencut-classic/timeline";
import { toElementDurationTicks } from "@/opencut-classic/timeline/creation";
import {
  addMediaTime,
  mediaTimeFromSeconds,
  mediaTimeToSeconds,
  type MediaTime,
} from "@/opencut-classic/wasm";
import type { PredictionResult } from "@/types/prediction";
import { parseSubtitleFile } from "@/opencut-classic/subtitles/parse";
import { insertCaptionChunksAsTextTrack } from "@/opencut-classic/subtitles/insert";

export type TimelineAiAction =
  | "smart-shot-split"
  | "smart-talking-cut"
  | "sound-effect"
  | "subtitle-ocr"
  | "stem"
  | "narration";

export type TimelineAiActionResult = {
  outputs: string[];
  insertedCount?: number;
  summaryKey?: string;
  summaryValues?: Record<string, number | string>;
};

const AI_SOUND_EFFECT_MODEL = "kwaivgi/kling-video-to-audio";
const SUBTITLE_OCR_MODEL = "wavespeed-ai/subtitle-ocr";
const STEM_SEPARATION_MODEL = "mureka-ai/stem-song";
const VIDEO_NARRATION_MODEL = "wavespeed-ai/molmo2/video-captioner";
const MIN_SPLIT_EDGE_SECONDS = 0.18;
const MIN_SCENE_GAP_SECONDS = 1.1;
const MAX_SMART_SPLITS = 60;
const SILENCE_BUCKET_SECONDS = 0.05;
const MIN_SILENCE_SECONDS = 0.42;
const SILENCE_KEEP_EDGE_SECONDS = 0.08;

function getAllTracks(editor: EditorCore): TimelineTrack[] {
  const scene = editor.scenes.getActiveSceneOrNull();
  if (!scene) return [];
  return [...scene.tracks.overlay, scene.tracks.main, ...scene.tracks.audio];
}

function findElementRef({
  editor,
  elementId,
}: {
  editor: EditorCore;
  elementId: string;
}): { trackId: string; element: TimelineElement } | null {
  for (const track of getAllTracks(editor)) {
    const element = track.elements.find(
      (candidate) => candidate.id === elementId,
    );
    if (element) {
      return { trackId: track.id, element };
    }
  }
  return null;
}

function splitElementAtLocalTimes({
  editor,
  element,
  localTimesSeconds,
}: {
  editor: EditorCore;
  element: TimelineElement;
  localTimesSeconds: number[];
}): number {
  const currentRef = findElementRef({ editor, elementId: element.id });
  if (!currentRef) return 0;

  const durationSeconds = mediaTimeToSeconds({ time: element.duration });
  const splitTimes = Array.from(
    new Set(
      localTimesSeconds
        .filter(
          (time) =>
            Number.isFinite(time) &&
            time > MIN_SPLIT_EDGE_SECONDS &&
            time < durationSeconds - MIN_SPLIT_EDGE_SECONDS,
        )
        .map((time) => Math.round(time * 1000) / 1000),
    ),
  ).sort((a, b) => b - a);

  let splitCount = 0;
  for (const localTime of splitTimes.slice(0, MAX_SMART_SPLITS)) {
    const splitTime = addMediaTime({
      a: element.startTime,
      b: mediaTimeFromSeconds({ seconds: localTime }),
    });
    editor.timeline.splitElements({
      elements: [{ trackId: currentRef.trackId, elementId: element.id }],
      splitTime,
    });
    splitCount += 1;
  }

  return splitCount;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * ratio)),
  );
  return sorted[index] ?? 0;
}

async function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "seeked",
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener("error", handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("无法读取视频帧"));
    };
    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const safeTime = Math.min(
    Math.max(0, time),
    Math.max(
      0,
      (Number.isFinite(video.duration) ? video.duration : time) - 0.03,
    ),
  );
  if (Math.abs(video.currentTime - safeTime) < 0.015) return;
  video.currentTime = safeTime;
  await waitForVideoEvent(video, "seeked");
}

function frameLumaSignature({
  context,
  width,
  height,
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
}): Uint8ClampedArray {
  const pixels = context.getImageData(0, 0, width, height).data;
  const signature = new Uint8ClampedArray(width * height);
  for (let index = 0; index < signature.length; index += 1) {
    const pixelIndex = index * 4;
    signature[index] =
      0.2126 * (pixels[pixelIndex] ?? 0) +
      0.7152 * (pixels[pixelIndex + 1] ?? 0) +
      0.0722 * (pixels[pixelIndex + 2] ?? 0);
  }
  return signature;
}

function signatureDiff(
  previous: Uint8ClampedArray,
  next: Uint8ClampedArray,
): number {
  const count = Math.min(previous.length, next.length);
  if (count === 0) return 0;
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    sum += Math.abs((previous[index] ?? 0) - (next[index] ?? 0));
  }
  return sum / count;
}

async function detectSceneSplitTimes({
  mediaAsset,
  element,
}: {
  mediaAsset: MediaAsset;
  element: TimelineElement;
}): Promise<number[]> {
  if (mediaAsset.type !== "video") {
    throw new Error("智能镜头分割需要选中视频片段");
  }

  const durationSeconds = mediaTimeToSeconds({ time: element.duration });
  if (durationSeconds < 1.2) return [];

  const sourceUrl = URL.createObjectURL(mediaAsset.file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;

  const canvas = document.createElement("canvas");
  const width = 64;
  const height = 36;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    URL.revokeObjectURL(sourceUrl);
    throw new Error("当前环境无法分析视频帧");
  }

  try {
    await waitForVideoEvent(video, "loadedmetadata");
    const sampleTarget = Math.min(
      120,
      Math.max(24, Math.ceil(durationSeconds / 0.8)),
    );
    const stepSeconds = Math.min(
      2,
      Math.max(0.35, durationSeconds / sampleTarget),
    );
    const trimStartSeconds = mediaTimeToSeconds({ time: element.trimStart });
    const samples: Array<{ localTime: number; diff: number }> = [];
    let previousSignature: Uint8ClampedArray | null = null;

    for (
      let localTime = Math.min(0.25, durationSeconds / 4);
      localTime < durationSeconds - MIN_SPLIT_EDGE_SECONDS;
      localTime += stepSeconds
    ) {
      await seekVideo(video, trimStartSeconds + localTime);
      context.drawImage(video, 0, 0, width, height);
      const signature = frameLumaSignature({ context, width, height });
      if (previousSignature) {
        samples.push({
          localTime,
          diff: signatureDiff(previousSignature, signature),
        });
      }
      previousSignature = signature;
    }

    const diffs = samples.map((sample) => sample.diff);
    const mean =
      diffs.reduce((sum, value) => sum + value, 0) / Math.max(1, diffs.length);
    const variance =
      diffs.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      Math.max(1, diffs.length);
    const threshold = Math.max(
      14,
      mean + Math.sqrt(variance) * 1.25,
      percentile(diffs, 0.82),
    );
    const splitTimes: number[] = [];

    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      if (!sample || sample.diff < threshold) continue;
      const previous = samples[index - 1]?.diff ?? 0;
      const next = samples[index + 1]?.diff ?? 0;
      const isLocalPeak = sample.diff >= previous && sample.diff >= next;
      const farEnough =
        splitTimes.length === 0 ||
        sample.localTime - splitTimes[splitTimes.length - 1] >=
          MIN_SCENE_GAP_SECONDS;
      if (isLocalPeak && farEnough) {
        splitTimes.push(sample.localTime);
      }
    }

    return splitTimes;
  } finally {
    video.remove();
    URL.revokeObjectURL(sourceUrl);
  }
}

function detectSilenceIntervals({
  audioBuffer,
  durationSeconds,
}: {
  audioBuffer: AudioBuffer;
  durationSeconds: number;
}): Array<{ start: number; end: number }> {
  const bucketCount = Math.max(
    1,
    Math.ceil(durationSeconds / SILENCE_BUCKET_SECONDS),
  );
  const channelCount = audioBuffer.numberOfChannels;
  const rmsValues: number[] = [];

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const startSample = Math.floor(
      (bucketIndex / bucketCount) * audioBuffer.length,
    );
    const endSample = Math.max(
      startSample + 1,
      Math.floor(((bucketIndex + 1) / bucketCount) * audioBuffer.length),
    );
    let sumSquares = 0;
    let sampleCount = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = audioBuffer.getChannelData(channel);
      for (let sample = startSample; sample < endSample; sample += 1) {
        const value = data[sample] ?? 0;
        sumSquares += value * value;
        sampleCount += 1;
      }
    }
    rmsValues.push(Math.sqrt(sumSquares / Math.max(1, sampleCount)));
  }

  const speechFloor = Math.max(
    0.012,
    percentile(rmsValues, 0.55) * 0.72,
    percentile(rmsValues, 0.9) * 0.08,
  );
  const intervals: Array<{ start: number; end: number }> = [];
  let silenceStart: number | null = null;

  for (let index = 0; index < rmsValues.length; index += 1) {
    const bucketStart = index * SILENCE_BUCKET_SECONDS;
    const bucketEnd = Math.min(
      durationSeconds,
      bucketStart + SILENCE_BUCKET_SECONDS,
    );
    const isSilent = (rmsValues[index] ?? 0) <= speechFloor;
    if (isSilent && silenceStart === null) {
      silenceStart = bucketStart;
    }
    if (
      (!isSilent || index === rmsValues.length - 1) &&
      silenceStart !== null
    ) {
      const end =
        isSilent && index === rmsValues.length - 1 ? bucketEnd : bucketStart;
      if (end - silenceStart >= MIN_SILENCE_SECONDS) {
        intervals.push({
          start: Math.max(0, silenceStart + SILENCE_KEEP_EDGE_SECONDS),
          end: Math.min(durationSeconds, end - SILENCE_KEEP_EDGE_SECONDS),
        });
      }
      silenceStart = null;
    }
  }

  return intervals.filter((interval) => interval.end - interval.start >= 0.25);
}

async function detectTalkingCutSilenceIntervals({
  editor,
  mediaAsset,
  element,
}: {
  editor: EditorCore;
  mediaAsset: MediaAsset;
  element: TimelineElement;
}): Promise<Array<{ start: number; end: number }>> {
  if (mediaAsset.type !== "audio" && mediaAsset.type !== "video") {
    throw new Error("智能剪口播需要选中带声音的视频或音频片段");
  }

  const scene = editor.scenes.getActiveSceneOrNull();
  if (!scene) return [];
  const audioContext = createAudioContext({ sampleRate: 16000 });
  try {
    const audioElements = await collectAudioElements({
      tracks: scene.tracks,
      mediaAssets: editor.media.getAssets(),
      audioContext,
    });
    const audioElement = audioElements.find(
      (candidate) => candidate.timelineElement.id === element.id,
    );
    if (!audioElement) {
      throw new Error("没有读取到当前片段的音频轨道");
    }

    const durationSeconds = mediaTimeToSeconds({ time: element.duration });
    const startSample = Math.floor(
      audioElement.trimStart * audioElement.buffer.sampleRate,
    );
    const endSample = Math.min(
      audioElement.buffer.length,
      startSample + Math.ceil(durationSeconds * audioElement.buffer.sampleRate),
    );
    const clipLength = Math.max(1, endSample - startSample);
    const clipBuffer = audioContext.createBuffer(
      audioElement.buffer.numberOfChannels,
      clipLength,
      audioElement.buffer.sampleRate,
    );
    for (
      let channel = 0;
      channel < audioElement.buffer.numberOfChannels;
      channel += 1
    ) {
      const source = audioElement.buffer
        .getChannelData(channel)
        .slice(startSample, endSample);
      clipBuffer.copyToChannel(source, channel);
    }

    return detectSilenceIntervals({ audioBuffer: clipBuffer, durationSeconds });
  } finally {
    void audioContext.close();
  }
}

function deleteSilenceSegments({
  editor,
  originalElement,
  intervals,
}: {
  editor: EditorCore;
  originalElement: TimelineElement;
  intervals: Array<{ start: number; end: number }>;
}): number {
  const originalRef = findElementRef({ editor, elementId: originalElement.id });
  if (!originalRef || !hasMediaId(originalElement)) return 0;

  const originalStart = originalElement.startTime;
  const originalEnd = originalElement.startTime + originalElement.duration;
  const track = getAllTracks(editor).find(
    (candidate) => candidate.id === originalRef.trackId,
  );
  if (!track) return 0;

  const refsToDelete = track.elements
    .filter((element) => {
      if (!hasMediaId(element) || element.mediaId !== originalElement.mediaId) {
        return false;
      }
      const elementStart = element.startTime;
      const elementEnd = element.startTime + element.duration;
      if (elementStart < originalStart || elementEnd > originalEnd)
        return false;
      const centerSeconds =
        mediaTimeToSeconds({
          time: (elementStart - originalStart) as MediaTime,
        }) +
        mediaTimeToSeconds({ time: element.duration }) / 2;
      return intervals.some(
        (interval) =>
          centerSeconds >= interval.start && centerSeconds <= interval.end,
      );
    })
    .map((element) => ({
      trackId: originalRef.trackId,
      elementId: element.id,
    }));

  if (refsToDelete.length === 0) return 0;

  const previousRippleState = editor.command.isRippleEnabled;
  editor.command.isRippleEnabled = true;
  try {
    editor.timeline.deleteElements({ elements: refsToDelete });
  } finally {
    editor.command.isRippleEnabled = previousRippleState;
  }

  return refsToDelete.length;
}

function collectPredictionOutputs(result: PredictionResult): string[] {
  const candidates = [
    ...(Array.isArray(result.outputs) ? result.outputs : []),
    (result as Record<string, unknown>).output,
    (result as Record<string, unknown>).url,
    (result as Record<string, unknown>).audio_url,
    (result as Record<string, unknown>).video_url,
    (result as Record<string, unknown>).file_url,
  ];

  return Array.from(
    new Set(
      candidates
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (!item || typeof item !== "object") return "";
          const record = item as Record<string, unknown>;
          return String(
            record.url ||
              record.download_url ||
              record.file_url ||
              record.audio_url ||
              record.video_url ||
              "",
          ).trim();
        })
        .filter(Boolean),
    ),
  );
}

async function resolveRemoteMediaUrl({
  mediaAsset,
  onUploadProgress,
}: {
  mediaAsset: MediaAsset;
  onUploadProgress?: (progress: number) => void;
}): Promise<string> {
  if (mediaAsset.url && /^https?:\/\//i.test(mediaAsset.url)) {
    return mediaAsset.url;
  }

  return apiClient.uploadFile(mediaAsset.file, undefined, onUploadProgress);
}

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split("/").filter(Boolean).pop();
    if (filename) return decodeURIComponent(filename);
  } catch {
    // Ignore malformed URLs and use the fallback.
  }
  return fallback;
}

async function downloadGeneratedFile(url: string, fallbackName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载生成结果失败 (${response.status})`);
  }
  const blob = await response.blob();
  const contentType = blob.type || response.headers.get("content-type") || "";
  const filename = filenameFromUrl(url, fallbackName);
  return new File([blob], filename, { type: contentType || undefined });
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function fetchGeneratedText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载生成文本失败 (${response.status})`);
  }
  return response.text();
}

function insertTextResultToTimeline({
  editor,
  text,
  element,
}: {
  editor: EditorCore;
  text: string;
  element: TimelineElement;
}): number {
  const content = text.trim();
  if (!content) return 0;
  const textElement = buildTextElement({
    startTime: element.startTime,
    raw: {
      name: "AI 解说词",
      duration: element.duration,
      params: {
        content,
      },
    },
  });
  editor.timeline.insertElement({
    element: textElement,
    placement: {
      mode: "auto",
      trackType: "text",
    },
  });
  return 1;
}

async function insertSubtitleOutputToTimeline({
  editor,
  output,
  element,
}: {
  editor: EditorCore;
  output: string;
  element: TimelineElement;
}): Promise<number> {
  const subtitleText = isRemoteUrl(output)
    ? await fetchGeneratedText(output)
    : output;
  const outputFileName = isRemoteUrl(output)
    ? filenameFromUrl(output, "captions.srt")
    : "captions.srt";
  const result = parseSubtitleFile({
    fileName: /\.(?:srt|ass)(?:[?#].*)?$/i.test(outputFileName)
      ? outputFileName
      : "captions.srt",
    input: subtitleText,
  });
  if (result.captions.length === 0) {
    throw new Error("没有识别到可插入的字幕");
  }
  const offsetSeconds = mediaTimeToSeconds({ time: element.startTime });
  const captions = result.captions.map((caption) => ({
    ...caption,
    startTime: caption.startTime + offsetSeconds,
  }));
  const trackId = insertCaptionChunksAsTextTrack({ editor, captions });
  return trackId ? captions.length : 0;
}

async function importOutputsToTimeline({
  editor,
  urls,
  startTime,
}: {
  editor: EditorCore;
  urls: string[];
  startTime: MediaTime;
}): Promise<number> {
  const project = editor.project.getActive();
  let insertedCount = 0;

  for (const [index, url] of urls.filter(isRemoteUrl).entries()) {
    const file = await downloadGeneratedFile(
      url,
      `ai-generated-${index + 1}.mp4`,
    );
    const processedAssets = await processMediaAssets({ files: [file] });
    for (const processedAsset of processedAssets) {
      const mediaAsset = await editor.media.addMediaAsset({
        projectId: project.id,
        asset: processedAsset,
      });
      if (!mediaAsset) continue;

      const element = buildElementFromMedia({
        mediaId: mediaAsset.id,
        mediaType: mediaAsset.type,
        name: mediaAsset.name,
        duration: toElementDurationTicks({ seconds: mediaAsset.duration }),
        startTime,
      });
      editor.timeline.insertElement({
        element,
        placement: {
          mode: "auto",
          trackType: mediaAsset.type === "audio" ? "audio" : "video",
        },
      });
      insertedCount += 1;
    }
  }

  return insertedCount;
}

function assertMediaAsset(mediaAsset: MediaAsset | undefined): MediaAsset {
  if (!mediaAsset) throw new Error("没有找到当前片段的素材");
  return mediaAsset;
}

export async function runTimelineAiAction({
  action,
  editor,
  element,
  mediaAsset,
  prompt,
  onUploadProgress,
}: {
  action: TimelineAiAction;
  editor: EditorCore;
  element: TimelineElement;
  mediaAsset: MediaAsset | undefined;
  prompt?: string;
  onUploadProgress?: (progress: number) => void;
}): Promise<TimelineAiActionResult> {
  const asset = assertMediaAsset(mediaAsset);

  if (action === "smart-shot-split") {
    const splitTimes = await detectSceneSplitTimes({
      mediaAsset: asset,
      element,
    });
    const splitCount = splitElementAtLocalTimes({
      editor,
      element,
      localTimesSeconds: splitTimes,
    });
    return {
      outputs: [],
      insertedCount: splitCount,
      summaryKey: "freeTools.mediaTrimmer.editor.contextMenu.aiSplitResult",
      summaryValues: { count: splitCount },
    };
  }

  if (action === "smart-talking-cut") {
    const silenceIntervals = await detectTalkingCutSilenceIntervals({
      editor,
      mediaAsset: asset,
      element,
    });
    const splitTimes = silenceIntervals.flatMap((interval) => [
      interval.start,
      interval.end,
    ]);
    splitElementAtLocalTimes({
      editor,
      element,
      localTimesSeconds: splitTimes,
    });
    const removedCount = deleteSilenceSegments({
      editor,
      originalElement: element,
      intervals: silenceIntervals,
    });
    return {
      outputs: [],
      insertedCount: removedCount,
      summaryKey:
        "freeTools.mediaTrimmer.editor.contextMenu.aiTalkingCutResult",
      summaryValues: {
        count: removedCount,
        seconds: silenceIntervals
          .reduce((sum, interval) => sum + interval.end - interval.start, 0)
          .toFixed(1),
      },
    };
  }

  const mediaUrl = await resolveRemoteMediaUrl({
    mediaAsset: asset,
    onUploadProgress,
  });

  if (action === "sound-effect") {
    if (asset.type !== "video") {
      throw new Error("AI 音效生成需要选中视频片段");
    }
    const result = await apiClient.run(AI_SOUND_EFFECT_MODEL, {
      video: mediaUrl,
      sound_effect_prompt: prompt || "",
      bgm_prompt: "",
      asmr_mode: false,
    });
    const outputs = collectPredictionOutputs(result);
    const insertedCount = await importOutputsToTimeline({
      editor,
      urls: outputs,
      startTime: element.startTime,
    });
    return { outputs, insertedCount };
  }

  if (action === "subtitle-ocr") {
    if (asset.type !== "video") {
      throw new Error("识别字幕/歌词需要选中视频片段");
    }
    const result = await apiClient.run(SUBTITLE_OCR_MODEL, {
      video: mediaUrl,
    });
    const outputs = collectPredictionOutputs(result);
    const insertedCount = outputs[0]
      ? await insertSubtitleOutputToTimeline({
          editor,
          output: outputs[0],
          element,
        })
      : 0;
    return { outputs, insertedCount };
  }

  if (action === "narration") {
    if (asset.type !== "video") {
      throw new Error("智能解说词需要选中视频片段");
    }
    const result = await apiClient.run(VIDEO_NARRATION_MODEL, {
      video: mediaUrl,
      detail_level: "high",
    });
    const outputs = collectPredictionOutputs(result);
    const narrationText = outputs.find((output) => !isRemoteUrl(output));
    const insertedCount = narrationText
      ? insertTextResultToTimeline({
          editor,
          text: narrationText,
          element,
        })
      : 0;
    return { outputs, insertedCount };
  }

  if (asset.type !== "audio") {
    throw new Error("声音分离需要选中音频片段");
  }
  const result = await apiClient.run(STEM_SEPARATION_MODEL, {
    audio: mediaUrl,
    model: "audio-separation-2",
  });
  const outputs = collectPredictionOutputs(result);
  const insertedCount = await importOutputsToTimeline({
    editor,
    urls: outputs,
    startTime: element.startTime,
  });
  return { outputs, insertedCount };
}

export async function replaceTimelineElementMedia({
  editor,
  element,
  file,
}: {
  editor: EditorCore;
  element: TimelineElement;
  file: File;
}): Promise<TimelineAiActionResult> {
  if (!hasMediaId(element)) {
    throw new Error("当前片段不能替换素材");
  }

  const processedAssets = await processMediaAssets({ files: [file] });
  const processedAsset = processedAssets[0];
  if (!processedAsset) {
    throw new Error("没有读取到可替换的素材");
  }

  const canReplaceVisual =
    (element.type === "video" || element.type === "image") &&
    (processedAsset.type === "video" || processedAsset.type === "image");
  const canReplaceAudio =
    element.type === "audio" && processedAsset.type === "audio";
  if (!canReplaceVisual && !canReplaceAudio) {
    throw new Error(
      "替换素材需要保持同类：视频/图片替换视频/图片，音频替换音频",
    );
  }

  const project = editor.project.getActive();
  const mediaAsset = await editor.media.addMediaAsset({
    projectId: project.id,
    asset: processedAsset,
  });
  if (!mediaAsset) {
    throw new Error("替换素材导入失败");
  }

  const currentRef = findElementRef({ editor, elementId: element.id });
  if (!currentRef) {
    throw new Error("没有找到当前时间线片段");
  }

  const replacement = buildElementFromMedia({
    mediaId: mediaAsset.id,
    mediaType: mediaAsset.type,
    name: mediaAsset.name,
    duration: toElementDurationTicks({ seconds: mediaAsset.duration }),
    startTime: element.startTime,
  });
  const replacementDuration = replacement.duration;
  const nextDuration =
    mediaAsset.type === "image"
      ? element.duration
      : Math.min(element.duration, replacementDuration);

  editor.timeline.updateElements({
    updates: [
      {
        trackId: currentRef.trackId,
        elementId: element.id,
        patch: {
          ...replacement,
          id: element.id,
          duration: nextDuration,
          startTime: element.startTime,
          params: element.params,
          animations: element.animations,
          effects: "effects" in element ? element.effects : undefined,
          masks: "masks" in element ? element.masks : undefined,
          hidden: "hidden" in element ? element.hidden : undefined,
        } as Partial<TimelineElement>,
      },
    ],
  });

  return {
    outputs: [],
    insertedCount: 1,
    summaryKey:
      "freeTools.mediaTrimmer.editor.contextMenu.aiReplaceMediaResult",
    summaryValues: { name: mediaAsset.name },
  };
}
