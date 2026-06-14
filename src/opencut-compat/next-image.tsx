import React from "react";

type NextImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "width" | "height"
> & {
  src: string | { src: string };
  width?: number | `${number}`;
  height?: number | `${number}`;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
  placeholder?: "blur" | "empty" | `data:image/${string}`;
  blurDataURL?: string;
};

export default function Image({
  src,
  width,
  height,
  fill,
  priority: _priority,
  quality: _quality,
  unoptimized: _unoptimized,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  style,
  ...props
}: NextImageProps) {
  const resolvedSrc = typeof src === "string" ? src : src.src;
  return (
    <img
      src={resolvedSrc}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={{
        ...style,
        ...(fill
          ? {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: props.className?.includes("object-contain")
                ? "contain"
                : "cover",
            }
          : null),
      }}
      {...props}
    />
  );
}
