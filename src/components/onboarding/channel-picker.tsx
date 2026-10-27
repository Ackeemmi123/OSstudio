"use client";

import { Check } from "lucide-react";
import { decodeSalesChannels, encodeSalesChannels, SALES_CHANNEL_LABELS, SALES_CHANNELS, toggleSalesChannel } from "@/lib/domain/brief";
import { cn } from "@/lib/cn";

/**
 * Multiple choice for sales channels. Reads and writes the stored text value,
 * so it plugs into any place that edits a brief value as a string.
 */
export function ChannelPicker({
  value,
  onChange,
  labelledBy,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  labelledBy: string;
  disabled?: boolean;
}) {
  const { channels, unrecognized } = decodeSalesChannels(value);
  return (
    <div>
      <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
        {SALES_CHANNELS.map((channel) => {
          const selected = channels.includes(channel);
          return (
            <button
              key={channel}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(encodeSalesChannels(toggleSalesChannel(channels, channel)))}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors disabled:opacity-60",
                channel === "none" ? "sm:ml-2" : "",
                selected
                  ? "border-primary bg-primary text-on-primary"
                  : "border-line-strong bg-surface text-ink-muted hover:border-accent hover:text-ink",
              )}
            >
              {selected ? <Check aria-hidden className="size-3.5" /> : null}
              {SALES_CHANNEL_LABELS[channel]}
            </button>
          );
        })}
      </div>
      {unrecognized.length ? (
        <p className="mt-2 text-[12px] text-caution">Also recorded: {unrecognized.join(", ")}. Choose the matching channels to replace it.</p>
      ) : null}
    </div>
  );
}
