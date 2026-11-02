"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const VIEWPORTS = {
  phone: { label: "Phone", width: 390, icon: Smartphone },
  tablet: { label: "Tablet", width: 768, icon: Tablet },
  desktop: { label: "Desktop", width: 1280, icon: Monitor },
} as const;
export type Viewport = keyof typeof VIEWPORTS;

export function ViewportButtons({ viewport, onChange }: { viewport: Viewport; onChange: (viewport: Viewport) => void }) {
  return (
    <div role="group" aria-label="Screen size" className="flex gap-1">
      {(Object.keys(VIEWPORTS) as Viewport[]).map((key) => {
        const { label, icon: Icon } = VIEWPORTS[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={viewport === key}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px]",
              viewport === key ? "border-ink bg-sunken text-ink" : "border-line-strong text-ink-muted hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A page drawn by src/lib/site-render, in a sandboxed frame with no
 * permissions: it cannot run scripts, reach the app or load anything but its
 * images. A wide viewport is scaled down to fit the space.
 */
export function PreviewFrame({ html, title, viewport, height, testId = "site-preview-frame" }: { html: string; title: string; viewport: Viewport; height: string; testId?: string }) {
  const [available, setAvailable] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const width = VIEWPORTS[viewport].width;
  const scale = available > 0 ? Math.min(1, available / width) : 1;

  return (
    <div ref={box} className="w-full">
      <div className="mx-auto overflow-hidden rounded-[var(--radius-surface)] border border-line bg-white" style={{ width: width * scale, height }}>
        <iframe
          title={title}
          sandbox=""
          srcDoc={html}
          data-testid={testId}
          style={{ width, height: `calc(${height} / ${scale})`, transform: `scale(${scale})`, transformOrigin: "top left", border: 0, display: "block" }}
        />
      </div>
    </div>
  );
}
