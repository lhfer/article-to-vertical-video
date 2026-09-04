import React from "react";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Rise, WordSlam } from "../components/Text";
import { hotIn } from "../text";

/** "3 分钟讲清 3 件事" + optional 目录 list (staggered). */
export const Promise: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const p = payloadOf(beat, "promise");
  const L = useLayout();
  const T = useTheme();
  const items = p.items ?? [];
  const size = fs(L, 68);
  const itemSize = fs(L, 42);
  const listTop = L.hero.y - Math.round(size * 0.2);
  const titleTop = items.length > 0 ? L.chart.y + Math.round(80 * L.fontScale) : L.hero.y - Math.round(size * 0.6);
  const rowH = Math.round(itemSize * 1.9);
  return (
    <SceneFrame beat={beat} info={info}>
      <WordSlam text={p.text} size={size} top={titleTop} delay={2} stagger={4} hot={hotIn(p.text, beat.lines)} hotLast={items.length === 0 && hotIn(p.text, beat.lines).length === 0} />
      {items.map((it, i) => (
        <Rise key={i} delay={12 + i * 7} style={{ position: "absolute", left: L.chart.x + Math.round(L.chart.w * 0.1), width: Math.round(L.chart.w * 0.8), top: listTop + i * rowH, display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: Math.round(itemSize * 1.3),
              height: Math.round(itemSize * 1.3),
              borderRadius: 14,
              background: T.gradients.hot,
              color: T.name === "paper" ? "#fff" : T.colors.bg,
              fontFamily: T.fonts.en,
              fontWeight: 900,
              fontSize: Math.round(itemSize * 0.8),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: T.glow > 0 ? `0 0 22px ${T.colors.accent}88` : "none",
            }}
          >
            {i + 1}
          </div>
          <div style={{ fontFamily: T.fonts.cn, fontSize: itemSize, fontWeight: 700, color: T.colors.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it}</div>
        </Rise>
      ))}
    </SceneFrame>
  );
};
