import type { Model } from "@/types/model";
import {
  getDefaultValues,
  normalizePayloadArrays,
  schemaToFormFields,
  type FormFieldConfig,
} from "@/lib/schemaToForm";

export const XIAOHONGSHU_DEFAULT_ASPECT_RATIO = "3:4";
export const XIAOHONGSHU_SUPPORTED_ASPECT_RATIOS = ["3:4", "1:1"] as const;
export type XiaohongshuAspectRatio =
  (typeof XIAOHONGSHU_SUPPORTED_ASPECT_RATIOS)[number];

export const XIAOHONGSHU_IMAGE_SIZE_BY_ASPECT_RATIO: Record<
  XiaohongshuAspectRatio,
  string
> = {
  "3:4": "1024x1536",
  "1:1": "1024x1024",
};

export const XIAOHONGSHU_CANVAS_SIZE_BY_ASPECT_RATIO: Record<
  XiaohongshuAspectRatio,
  string
> = {
  "3:4": "1200 x 1600",
  "1:1": "1200 x 1200",
};

export interface XiaohongshuCopyDraft {
  titles: string[];
  copywriting: string;
  tags: string[];
}

export type XiaohongshuPageType = "cover" | "content" | "summary";

export interface XiaohongshuPage {
  index: number;
  type: XiaohongshuPageType;
  content: string;
}

export interface XiaohongshuGeneratedImage {
  index: number;
  url: string;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
  prompt?: string;
  model?: string;
}

export interface XiaohongshuFormState {
  topic: string;
  audience: string;
  sellingPoints: string;
  tone: string;
  pageType: string;
  pageCount: number;
  aspectRatio: XiaohongshuAspectRatio;
}

export function normalizeXiaohongshuAspectRatio(
  input?: string | null,
): XiaohongshuAspectRatio {
  const normalized = String(input || "")
    .trim()
    .replace(/\s+/g, "");
  return XIAOHONGSHU_SUPPORTED_ASPECT_RATIOS.includes(
    normalized as XiaohongshuAspectRatio,
  )
    ? (normalized as XiaohongshuAspectRatio)
    : XIAOHONGSHU_DEFAULT_ASPECT_RATIO;
}

export function resolveXiaohongshuImageSize(
  aspectRatio?: string | null,
): string {
  return XIAOHONGSHU_IMAGE_SIZE_BY_ASPECT_RATIO[
    normalizeXiaohongshuAspectRatio(aspectRatio)
  ];
}

function compactLines(value: string): string[] {
  return value
    .split(/[\n,，;；、]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function cleanTopic(topic: string): string {
  return topic.trim() || "小红书图文笔记";
}

export function splitPageContentAndPrompt(content: string): {
  content: string;
  prompt: string;
} {
  const raw = String(content || "").trim();
  if (!raw) return { content: "", prompt: "" };

  const markerMatch = raw.match(/\n\s*配图建议[:：]\s*/i);
  if (!markerMatch || markerMatch.index === undefined) {
    return { content: raw, prompt: "" };
  }

  return {
    content: raw.slice(0, markerMatch.index).trim() || raw,
    prompt: raw.slice(markerMatch.index + markerMatch[0].length).trim(),
  };
}

export function buildPageContentWithPrompt(
  content: string,
  prompt?: string,
): string {
  const split = splitPageContentAndPrompt(content);
  const nextContent = split.content || String(content || "").trim();
  const nextPrompt = String(prompt || split.prompt || "").trim();
  return nextPrompt
    ? `${nextContent}\n\n配图建议：${nextPrompt}`.trim()
    : nextContent.trim();
}

function normalizePageType(
  rawType: unknown,
  fallback: XiaohongshuPageType = "content",
): XiaohongshuPageType {
  const value = String(rawType || "")
    .trim()
    .toLowerCase();
  if (value === "cover" || value === "封面") return "cover";
  if (value === "summary" || value === "总结") return "summary";
  if (value === "content" || value === "内容") return "content";
  return fallback;
}

export function pageTypeLabel(type: XiaohongshuPageType): string {
  if (type === "cover") return "封面";
  if (type === "summary") return "总结";
  return "内容";
}

export function normalizeOutlinePageContent(
  content: string,
  pageType?: XiaohongshuPageType,
): string {
  const raw = String(content || "").trim();
  if (!raw) return "";

  const split = splitPageContentAndPrompt(raw);
  const lines = split.content.split(/\r?\n/).map((line) => line.trimEnd());
  const filtered = [...lines];
  if (
    /^\[(封面|内容|总结|cover|content|summary)\]$/i.test(
      filtered[0]?.trim() || "",
    )
  ) {
    filtered.shift();
  }

  const normalizedLines: string[] = [];
  for (const line of filtered) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (normalizedLines[normalizedLines.length - 1] !== "") {
        normalizedLines.push("");
      }
      continue;
    }

    const titleMatch = trimmed.match(/^标题[:：]\s*(.+)$/);
    if (titleMatch) {
      normalizedLines.push(`# ${titleMatch[1].trim()}`);
      continue;
    }

    const subtitleMatch = trimmed.match(/^副标题[:：]\s*(.+)$/);
    if (subtitleMatch) {
      normalizedLines.push(`## ${subtitleMatch[1].trim()}`);
      continue;
    }

    const backgroundMatch = trimmed.match(/^背景[:：]\s*(.+)$/);
    if (backgroundMatch) {
      normalizedLines.push(backgroundMatch[1].trim());
      continue;
    }

    normalizedLines.push(trimmed);
  }

  const compact = normalizedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!compact) return "";

  const compactLines = compact.split(/\r?\n/);
  const firstMeaningfulIndex = compactLines.findIndex((line) => line.trim());
  if (firstMeaningfulIndex >= 0) {
    const firstMeaningfulLine = compactLines[firstMeaningfulIndex].trim();
    const shouldPromoteToHeading =
      pageType !== "cover" &&
      !/^(#{1,6}\s|[-*•]\s|\d+[.)、]\s|配图建议[:：])/i.test(
        firstMeaningfulLine,
      ) &&
      firstMeaningfulLine.length <= 34;

    if (shouldPromoteToHeading) {
      compactLines[firstMeaningfulIndex] =
        `### ${firstMeaningfulLine.replace(/^[-*•]\s*/, "")}`;
    }
  }

  return compactLines.join("\n").trim();
}

export function buildFallbackImageSuggestion(
  page: Pick<XiaohongshuPage, "type" | "content">,
): string {
  const cleanContent = normalizeOutlinePageContent(
    splitPageContentAndPrompt(page.content).content,
    page.type,
  );
  const brief = cleanContent
    .replace(/^#{1,3}\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 56);

  if (page.type === "cover") {
    return `画面采用统一的系列化封面视觉，围绕“${brief || "本页主题"}”建立强记忆点。使用干净但高级的主体构图，突出核心产品或概念主体，补充柔和背景纹理、轻装饰元素和更有情绪感的光线，让封面一眼就能传达主题与气质。`;
  }
  if (page.type === "summary") {
    return `延续前文主视觉做收尾页，围绕“${brief || "本页要点"}”营造更轻松、完成感更强的结尾氛围。保留统一配色与材质语言，增加留白、总结感符号或温和互动元素。`;
  }
  return `围绕本页重点“${brief || "本页内容"}”设计一张可直接用于图文卡片的竖版配图。明确主体物、色调和场景关系，补充材质、光影、构图层次与少量辅助元素。`;
}

export function parseOutlinePages(outlineText: string): XiaohongshuPage[] {
  const raw = String(outlineText || "").trim();
  if (!raw) return [];

  const splitByPageMarkers = (input: string) => {
    const normalized = String(input || "").replace(/\r\n/g, "\n");
    const markerRegex =
      /(?:^|\n)\s*(\[(?:封面|内容|总结|cover|content|summary)\])/gi;
    const matches = Array.from(normalized.matchAll(markerRegex));
    if (matches.length <= 1) return [normalized];

    return matches
      .map((match, index) => {
        const markerIndex = match.index ?? 0;
        const start =
          normalized[markerIndex] === "\n" ? markerIndex + 1 : markerIndex;
        const end =
          index + 1 < matches.length
            ? (matches[index + 1].index ?? normalized.length) ||
              normalized.length
            : normalized.length;
        return normalized.slice(start, end);
      })
      .filter(Boolean);
  };

  const blocks = (
    raw.includes("<page>") ? raw.split(/<page>/i) : raw.split(/\n-{3,}\n/g)
  ).flatMap((block) => splitByPageMarkers(block));

  const pages: XiaohongshuPage[] = [];

  for (const block of blocks) {
    const content = String(block || "").trim();
    if (!content) continue;
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim();
    let type: XiaohongshuPageType = "content";
    if (firstLine === "[封面]" || firstLine === "[cover]") type = "cover";
    else if (firstLine === "[总结]" || firstLine === "[summary]")
      type = "summary";

    pages.push({
      index: pages.length,
      type,
      content: normalizeOutlinePageContent(content, type),
    });
  }

  return pages;
}

export function buildOutlineRawFromPages(
  pages: XiaohongshuPage[],
  generatedImages: Array<
    Pick<XiaohongshuGeneratedImage, "index" | "prompt">
  > = [],
): string {
  const promptMap = new Map<number, string>();
  for (const item of Array.isArray(generatedImages) ? generatedImages : []) {
    const index = Number(item?.index);
    const prompt = String(item?.prompt || "").trim();
    if (Number.isInteger(index) && index >= 0 && prompt) {
      promptMap.set(index, prompt);
    }
  }

  return (Array.isArray(pages) ? pages : [])
    .map((page, index) => {
      const type = normalizePageType(page?.type);
      const rawContent = buildPageContentWithPrompt(
        String(page?.content || "").trim(),
        promptMap.get(Number.isInteger(page?.index) ? page.index : index),
      );
      const prefix =
        type === "cover" ? "[封面]" : type === "summary" ? "[总结]" : "[内容]";
      if (!rawContent) return `${prefix}\n`;
      const firstLine = rawContent.split(/\r?\n/, 1)[0]?.trim();
      const hasExplicitType =
        /^\[(封面|总结|内容|cover|summary|content)\]/i.test(firstLine || "");
      return hasExplicitType ? rawContent : `${prefix}\n${rawContent}`;
    })
    .join("\n\n<page>\n\n");
}

export function generateXiaohongshuCopyDraft(
  form: XiaohongshuFormState,
): XiaohongshuCopyDraft {
  const topic = cleanTopic(form.topic);
  const audience = form.audience.trim() || "正在寻找灵感的用户";
  const points = compactLines(form.sellingPoints);
  const primaryPoint = points[0] || "真实好用、上手简单、出片稳定";
  const tone = form.tone || "真实种草";

  const titles = [
    `${topic}这样做，真的太出片了`,
    `${audience}一定要试的${topic}`,
    `我把${topic}的重点整理好了`,
  ].map((title) => title.slice(0, 30));

  const pointText =
    points.length > 0
      ? points.map((point) => `- ${point}`).join("\n")
      : `- ${primaryPoint}\n- 画面干净，信息一眼能读懂\n- 适合收藏和转发`;

  const copywriting = [
    `最近整理${topic}，发现真正吸引人的不是堆信息，而是第一眼就让人想点开。`,
    `这次我会重点突出：\n${pointText}`,
    `整体语气走${tone}路线，画面保留清爽留白，标题短一点、重点大一点，读起来更像朋友在认真分享。`,
    `如果你也在做类似内容，可以直接把这套结构用到封面和正文里，先抓住注意力，再把价值点讲清楚。`,
  ].join("\n\n");

  const tags = Array.from(
    new Set(
      [
        topic.replace(/\s+/g, ""),
        "小红书封面",
        "小红书文案",
        "种草笔记",
        "图文笔记",
        "内容运营",
        primaryPoint.replace(/\s+/g, "").slice(0, 12),
      ].filter(Boolean),
    ),
  ).slice(0, 8);

  return { titles, copywriting, tags };
}

export function generateXiaohongshuOutlineDraft(
  form: XiaohongshuFormState,
  referenceImageCount: number,
): {
  pages: XiaohongshuPage[];
  outlineRaw: string;
  copy: XiaohongshuCopyDraft;
} {
  const topic = cleanTopic(form.topic);
  const points = compactLines(form.sellingPoints);
  const copy = generateXiaohongshuCopyDraft(form);
  const targetCount = Math.max(
    1,
    Math.min(15, Math.round(form.pageCount || 6)),
  );
  const bodyCount = Math.max(0, targetCount - 2);
  const pointPool =
    points.length > 0
      ? points
      : ["核心价值", "使用场景", "操作方法", "避坑提示", "收藏清单"];

  const pages: XiaohongshuPage[] = [
    {
      index: 0,
      type: "cover",
      content: normalizeOutlinePageContent(
        [
          `标题：${copy.titles[0]}`,
          `副标题：${form.audience.trim() || "一篇帮你快速看懂的图文笔记"}`,
          referenceImageCount > 0
            ? "背景：结合参考图主体与清爽小红书封面排版，突出主题和点击欲。"
            : "背景：清新精致的生活方式场景，标题醒目，主体清晰。",
          `配图建议：围绕“${topic}”设计爆款封面，标题大而醒目，主体居中或三分构图，保留干净留白和轻量装饰。`,
        ].join("\n"),
        "cover",
      ),
    },
  ];

  for (let i = 0; i < bodyCount; i += 1) {
    const point = pointPool[i % pointPool.length];
    pages.push({
      index: pages.length,
      type: "content",
      content: normalizeOutlinePageContent(
        [
          `第${i + 1}点：${point}`,
          "",
          `为什么值得看：围绕“${topic}”把 ${point} 讲清楚，语言要像朋友分享，直接、真诚、有获得感。`,
          `呈现方式：用短句、数字、对比或清单增强可读性，避免堆满小字。`,
          `小贴士：给出一个可执行建议，让读者愿意收藏。`,
          "",
          `配图建议：${buildFallbackImageSuggestion({
            type: "content",
            content: `${point}\n${topic}`,
          })}`,
        ].join("\n"),
        "content",
      ),
    });
  }

  if (targetCount > 1) {
    pages.push({
      index: pages.length,
      type: "summary",
      content: normalizeOutlinePageContent(
        [
          "总结：照着这份清单做就够了",
          "",
          `记住三个重点：`,
          `✅ ${pointPool[0] || "先抓主题"}`,
          `✅ ${pointPool[1] || "信息分层"}`,
          `✅ ${pointPool[2] || "画面统一"}`,
          "",
          "互动引导：你还想看哪类主题？评论区告诉我。",
          "",
          `配图建议：延续封面视觉风格，做一页有完成感的总结卡片，保留统一配色、清爽留白和收藏提示。`,
        ].join("\n"),
        "summary",
      ),
    });
  }

  return {
    pages: pages.map((page, index) => ({ ...page, index })),
    outlineRaw: buildOutlineRawFromPages(pages),
    copy,
  };
}

export function generateXiaohongshuContentFromPages(
  pages: XiaohongshuPage[],
  form: XiaohongshuFormState,
): XiaohongshuCopyDraft {
  if (!pages.length) return generateXiaohongshuCopyDraft(form);

  const topic = cleanTopic(form.topic);
  const cover = pages.find((page) => page.type === "cover") ?? pages[0];
  const coverText = splitPageContentAndPrompt(cover?.content || "").content;
  const coverLines = coverText
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s*/, "").trim())
    .filter(Boolean);
  const firstHeading =
    coverLines.find((line) => !/^副标题|背景|配图建议/i.test(line)) || topic;
  const contentPages = pages.filter((page) => page.type === "content");
  const summaryPage = pages.find((page) => page.type === "summary");
  const titles = Array.from(
    new Set(
      [
        firstHeading.slice(0, 30),
        `${topic}，这篇真的建议收藏`.slice(0, 30),
        `把${topic}讲清楚了`.slice(0, 30),
      ].filter(Boolean),
    ),
  ).slice(0, 3);

  const bodySections = contentPages.slice(0, 6).map((page, index) => {
    const text = splitPageContentAndPrompt(page.content)
      .content.replace(/^#{1,6}\s*/gm, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join("\n");
    return `${index + 1}. ${text}`;
  });
  const summaryText = summaryPage
    ? splitPageContentAndPrompt(summaryPage.content)
        .content.replace(/^#{1,6}\s*/gm, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 4)
        .join("\n")
    : "照着这套思路做，内容会更清楚，也更适合收藏。";

  const copywriting = [
    `最近整理了${topic}，发现真正让人想收藏的内容，都是先把重点讲清楚，再把画面做得足够好读。`,
    ...bodySections,
    summaryText,
    "你们还想看哪类主题？可以直接告诉我，我继续整理。",
  ].join("\n\n");

  const tags = Array.from(
    new Set([
      topic.replace(/\s+/g, ""),
      "小红书图文",
      "小红书封面",
      "小红书文案",
      "内容运营",
      form.pageType,
      form.tone,
    ]),
  )
    .filter(Boolean)
    .slice(0, 8);

  return { titles, copywriting, tags };
}

export function buildXiaohongshuImagePrompt(params: {
  form: XiaohongshuFormState;
  page: XiaohongshuPage;
  fullOutline: string;
  referenceImageCount: number;
  styleReferenceCount: number;
  promptSuggestion?: string;
}): string {
  const { form, page, fullOutline, referenceImageCount, styleReferenceCount } =
    params;
  const topic = cleanTopic(form.topic);
  const split = splitPageContentAndPrompt(page.content);
  const promptSuggestion =
    params.promptSuggestion ||
    split.prompt ||
    buildFallbackImageSuggestion(page);
  const aspectText =
    form.aspectRatio === "1:1"
      ? "1:1 方形图，适合手机端查看"
      : "3:4 竖版图，适合手机端查看";
  const type = pageTypeLabel(page.type);

  return [
    "请生成一张小红书风格的图文内容图片。",
    "注意不要带有任何小红书 logo，不要有右下角用户 id、平台 logo、账号角标或水印。",
    `主题：${topic}`,
    `当前页面类型：${type}`,
    `当前页面内容：\n${split.content}`,
    `配图建议：${promptSuggestion}`,
    `完整图文大纲（仅用于理解上下文和统一风格，不要把其他页面内容画进当前页）：\n${fullOutline}`,
    referenceImageCount > 0
      ? "用户参考图用途：参考主体、材质、场景、产品外观或配色，但不要复制参考图里的文字、logo、水印、品牌名、账号名或角标。"
      : "",
    styleReferenceCount > 0 && page.type !== "cover"
      ? "风格参考：当前页面不是封面页时，请参考随请求附带的封面或风格参考图，保持配色、版式节奏、装饰密度和整体质感统一。"
      : "",
    "设计要求：小红书爆款图文风格，清新、精致、有设计感，适合年轻人审美；配色和谐，视觉吸引力强。",
    "页面类型规则：封面页标题最大、最醒目，有视觉焦点；内容页信息层次分明，重点用颜色或粗体强调；总结页有完成感和收藏提示。",
    `技术规格：${aspectText}，高清画质，所有文字内容必须完整呈现，不要手机边框或白色留边。`,
    `文字硬性要求：`,
    `- 画面中所有可见文字必须是简体中文短句，允许阿拉伯数字和常用中文标点。`,
    `- 禁止乱码、伪中文、繁体字、英文、日文、韩文、随机字符、无意义符号、反字、倒字和镜像文字。`,
    `- 不要出现 Alpha、Beta、A/B Test 等英文词；改成“第一类、第二类、对比测试”等简体中文表达。`,
    `- 如果无法保证长句准确，减少文字数量，只保留短标题、短副标题和短要点；宁可留白，也不要生成伪文字。`,
    `- 核心标题、短副标题和要点应由图片模型直接生成在画面中；不要生成密集小字或读不通的文字纹理。`,
    `- 页面内容中的 #、##、### 只代表标题层级或话题标记，不是可见文字；图片上的标题必须去掉井号。`,
    `- 图片上不要出现 #、@、[@image-ref:...]、URL、文件名、Markdown 符号或任何调试占位符。`,
    "本次只生成当前这一页，不要把其他页面内容画进画面。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getRequestSchema(model: Model) {
  return model.api_schema?.components?.schemas?.Request;
}

export function getModelFormFields(model: Model): FormFieldConfig[] {
  const schema = getRequestSchema(model);
  const properties = schema?.properties ?? {};
  const orderProperties =
    (schema as { "x-order-properties"?: string[] } | undefined)?.[
      "x-order-properties"
    ] ?? [];
  return schemaToFormFields(
    properties,
    schema?.required ?? [],
    orderProperties,
  );
}

function findField(
  fields: FormFieldConfig[],
  names: string[],
  fallback?: (field: FormFieldConfig) => boolean,
) {
  const lowerNames = names.map((name) => name.toLowerCase());
  return (
    fields.find((field) => lowerNames.includes(field.name.toLowerCase())) ??
    fields.find((field) =>
      lowerNames.some((name) => field.name.toLowerCase().includes(name)),
    ) ??
    fields.find((field) => fallback?.(field))
  );
}

function pickEnumValue(
  options: (string | number)[] | undefined,
  candidates: string[],
) {
  if (!options?.length) return undefined;
  const normalizedCandidates = candidates.map((candidate) =>
    candidate.toLowerCase(),
  );
  return options.find((option) => {
    const value = String(option).toLowerCase();
    return normalizedCandidates.some((candidate) => value.includes(candidate));
  });
}

export function buildXiaohongshuImagePayload(params: {
  model: Model;
  form: XiaohongshuFormState;
  prompt: string;
  referenceImageUrls: string[];
}) {
  const fields = getModelFormFields(params.model);
  const defaults = getDefaultValues(fields);
  const payload: Record<string, unknown> = { ...defaults };

  const promptField = findField(
    fields,
    ["prompt", "text", "content", "description"],
    (field) => field.type === "textarea" || field.type === "text",
  );
  if (promptField) payload[promptField.name] = params.prompt;

  const imageArrayField = findField(
    fields,
    ["images", "image_urls", "reference_images", "reference_image_urls"],
    (field) =>
      field.type === "file-array" && Boolean(field.accept?.includes("image")),
  );
  const imageField = findField(
    fields,
    ["image", "image_url", "input_image", "reference_image"],
    (field) =>
      field.type === "file" && Boolean(field.accept?.includes("image")),
  );
  if (params.referenceImageUrls.length > 0 && imageArrayField) {
    payload[imageArrayField.name] = params.referenceImageUrls;
  } else if (params.referenceImageUrls.length > 0 && imageField) {
    payload[imageField.name] = params.referenceImageUrls[0];
  }

  const aspectField = findField(fields, ["aspect_ratio", "ratio"]);
  if (aspectField) {
    const enumValue = pickEnumValue(aspectField.options, [
      params.form.aspectRatio,
      params.form.aspectRatio.replace(":", "x"),
      params.form.aspectRatio.replace(":", "*"),
    ]);
    payload[aspectField.name] = enumValue ?? params.form.aspectRatio;
  }

  const sizeField = findField(fields, ["size", "resolution"]);
  if (sizeField) {
    const size = resolveXiaohongshuImageSize(params.form.aspectRatio);
    const enumValue = pickEnumValue(sizeField.options, [
      size,
      size.replace("x", "*"),
      params.form.aspectRatio,
    ]);
    payload[sizeField.name] = enumValue ?? size;
  }

  const widthField = findField(fields, ["width"]);
  const heightField = findField(fields, ["height"]);
  if (widthField && heightField) {
    const [width, height] = resolveXiaohongshuImageSize(params.form.aspectRatio)
      .split("x")
      .map(Number);
    payload[widthField.name] = width;
    payload[heightField.name] = height;
  }

  const formatField = findField(fields, ["output_format", "format"]);
  if (formatField) {
    const enumValue = pickEnumValue(formatField.options, ["png", "jpg"]);
    if (enumValue) payload[formatField.name] = enumValue;
  }

  return normalizePayloadArrays(payload, fields);
}

export function buildXiaohongshuTextPrompt(params: {
  form: XiaohongshuFormState;
  referenceImageCount: number;
}): string {
  const { form, referenceImageCount } = params;
  const targetCount = Math.max(
    1,
    Math.min(15, Math.round(form.pageCount || 6)),
  );
  return [
    "你是一个小红书内容创作专家。用户会给你一个要求以及说明，你需要生成一个适合小红书的图文内容大纲。",
    `用户的要求以及说明：\n${cleanTopic(form.topic)}`,
    form.audience.trim() ? `目标人群：${form.audience.trim()}` : "",
    form.sellingPoints.trim()
      ? `核心卖点或补充说明：\n${form.sellingPoints.trim()}`
      : "",
    `语言风格：${form.tone}`,
    referenceImageCount > 0
      ? "用户上传了参考图片。请结合参考图中的主体、场景、视觉气质或产品信息来规划内容，但不要复制参考图里的文字、水印、logo、账号名或角标。"
      : "",
    "要求：",
    "1. 第一页必须是吸引人的封面/标题页，包含标题和副标题。",
    `2. 必须严格生成 ${targetCount} 页（包括封面和总结页），不得多也不得少。`,
    "3. 每页内容简洁有力，适合配图展示。",
    "4. 使用小红书风格的语言：亲切、有趣、实用。",
    "5. 可以适当使用 emoji 增加趣味性。",
    "6. 内容要有实用价值，能解决用户问题或提供有用信息。",
    "7. 最后一页可以是总结或行动呼吁。",
    "输出格式（严格遵守）：",
    "- 用 <page> 标签分割每一页。",
    "- 每页第一行是页面类型标记：[封面]、[内容]、[总结]。",
    "- 每页末尾必须包含“配图建议：...”，内容要具体、详细，方便后续生成图片。",
    "- 避免在内容中使用 | 竖线符号。",
    "请直接从 [封面] 开始输出，不要有任何多余说明或对话。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildXiaohongshuTextPayload(params: {
  model: Model;
  prompt: string;
  referenceImageUrls: string[];
}) {
  const fields = getModelFormFields(params.model);
  const defaults = getDefaultValues(fields);
  const payload: Record<string, unknown> = { ...defaults };

  const promptField = findField(
    fields,
    ["prompt", "text", "content", "message", "query", "input"],
    (field) => field.type === "textarea" || field.type === "text",
  );
  if (promptField) payload[promptField.name] = params.prompt;

  const imageArrayField = findField(
    fields,
    ["images", "image_urls", "reference_images", "reference_image_urls"],
    (field) =>
      field.type === "file-array" && Boolean(field.accept?.includes("image")),
  );
  const imageField = findField(
    fields,
    ["image", "image_url", "input_image", "reference_image"],
    (field) =>
      field.type === "file" && Boolean(field.accept?.includes("image")),
  );
  if (params.referenceImageUrls.length > 0 && imageArrayField) {
    payload[imageArrayField.name] = params.referenceImageUrls;
  } else if (params.referenceImageUrls.length > 0 && imageField) {
    payload[imageField.name] = params.referenceImageUrls[0];
  }

  return normalizePayloadArrays(payload, fields);
}

export function normalizePredictionOutputs(
  outputs: (string | Record<string, unknown>)[] | undefined,
): string[] {
  return (outputs ?? [])
    .map((output) => {
      if (typeof output === "string") return output;
      if (typeof output?.url === "string") return output.url;
      if (typeof output?.image === "string") return output.image;
      if (typeof output?.image_url === "string") return output.image_url;
      if (typeof output?.download_url === "string") return output.download_url;
      return "";
    })
    .filter(Boolean);
}

export function normalizeTextOutputs(
  outputs: (string | Record<string, unknown>)[] | undefined,
): string {
  const texts = (outputs ?? [])
    .map((output) => {
      if (typeof output === "string") return output;
      if (typeof output?.text === "string") return output.text;
      if (typeof output?.content === "string") return output.content;
      if (typeof output?.output === "string") return output.output;
      if (typeof output?.message === "string") return output.message;
      return "";
    })
    .filter(Boolean);
  return texts.join("\n\n").trim();
}
