import React from "react";
import { Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { BenchRow, BenchTable, SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { BENCH, payloadOf, tableOf } from "../content";
import { VO_LEAD, mentionProportion } from "../narration";
import { fmtNumber } from "../text";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { bigNumberStyle, displayAccentStyle } from "../components/ui";

const RACE = { damping: 14, stiffness: 60 };

const decimalsFor = (a: number, b: number) => (Number.isInteger(a) && Number.isInteger(b) ? 0 : 1);

/** "领先 X +d" / "落后 X −d" / "比X低 d 个点" */
const deltaText = (t: BenchTable, hero: BenchRow, rival: BenchRow): string => {
  const d = hero.value - rival.value;
  const dec = decimalsFor(hero.value, rival.value);
  const abs = Math.abs(d).toFixed(dec);
  if (t.lowerIsBetter) return d <= 0 ? `比 ${rival.model} 低 ${abs} 个点` : `比 ${rival.model} 高 ${abs} 个点`;
  return d >= 0 ? `领先 ${rival.model} +${abs}` : `落后 ${rival.model} −${abs}`;
};

const splitRows = (t: BenchTable) => {
  const hero = t.rows.find((r) => r.model === BENCH.hero) ?? t.rows[0];
  const others = t.rows.filter((r) => r !== hero);
  const rival = others.length ? others.reduce((a, r) => (t.lowerIsBetter ? (r.value < a.value ? r : a) : r.value > a.value ? r : a)) : null;
  const rest = others.filter((r) => r !== rival);
  const heroWins = rival ? (t.lowerIsBetter ? hero.value <= rival.value : hero.value >= rival.value) : true;
  return { hero, rival, rest, heroWins };
};

/** First frame at which the racing bars have both reached the smaller value (the race is decided). */
const passFrame = (fps: number, hero: number, rival: number, delay: number) => {
  const ratio = Math.min(hero, rival) / Math.max(hero, rival, 1e-9);
  for (let f = 0; f < 150; f++) if (spring({ frame: f - delay, fps, config: RACE }) >= ratio) return f + 3;
  return 40;
};

const RaceRow: React.FC<{ row: BenchRow; t: BenchTable; max: number; top: number; delay: number; hero: boolean; barW: number; labelW: number }> = ({ row, t, max, top, delay, hero, barW, labelW }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const s = spring({ frame: frame - delay, fps, config: RACE });
  const p = Math.min(1, s);
  const shown = row.value * p;
  const h = hero ? fs(L, 34) : fs(L, 26);
  const valueSize = hero ? fs(L, 56) : fs(L, 44);
  return (
    <div style={{ position: "absolute", left: L.chart.x, top, width: L.chart.w, opacity: frame < delay - 4 ? 0 : 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ width: labelW, fontFamily: T.fonts.cn, fontSize: fs(L, hero ? 32 : 28), fontWeight: hero ? 800 : 600, color: hero ? T.colors.fg : T.colors.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {row.model}
          {row.flag ? <span style={{ color: T.colors.accent2, marginLeft: 4 }}>{row.flag}</span> : null}
        </div>
        <div style={{ fontFamily: T.fonts.en, fontSize: valueSize, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, ...(hero ? bigNumberStyle(T) : { color: T.colors.dim }) }}>{fmtNumber(row.value, shown, t.unit)}</div>
      </div>
      <div style={{ position: "relative", marginTop: 8, height: h, borderRadius: h / 2, background: T.colors.barBg, width: barW }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: h,
            width: (Math.abs(row.value) / max) * barW * p,
            borderRadius: h / 2,
            background: hero ? T.gradients.hot : t.lowerIsBetter ? T.gradients.fire : T.colors.dim,
            opacity: hero ? 1 : 0.7,
            boxShadow: hero && T.glow > 0 ? `0 0 22px ${T.colors.accent}aa` : "none",
          }}
        />
      </div>
    </div>
  );
};

const SmallRow: React.FC<{ row: BenchRow; t: BenchTable; max: number; top: number; delay: number; rowH: number; hero: boolean }> = ({ row, t, max, top, delay, rowH, hero }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 140 } });
  const p = Math.min(1, s);
  const size = Math.max(28, fs(L, 28));
  const labelW = Math.round(L.chart.w * 0.3);
  const valueW = Math.round(L.chart.w * 0.17);
  const barW = L.chart.w - labelW - valueW - 24;
  return (
    <div style={{ position: "absolute", left: L.chart.x, top, width: L.chart.w, height: rowH, display: "flex", alignItems: "center", opacity: frame < delay ? 0 : Math.min(1, s * 2), translate: `0 ${interpolate(s, [0, 1], [14, 0])}px` }}>
      <div style={{ width: labelW, fontFamily: T.fonts.cn, fontSize: size, fontWeight: hero ? 800 : 500, color: hero ? T.colors.fg : T.colors.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {row.model}
        {row.flag ? <span style={{ color: T.colors.accent2, marginLeft: 4 }}>{row.flag}</span> : null}
      </div>
      <div style={{ width: barW, height: Math.round(rowH * 0.32), borderRadius: 999, background: T.colors.barBg, position: "relative", marginRight: 24 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: (Math.abs(row.value) / max) * barW * p, borderRadius: 999, background: hero ? T.gradients.hot : T.colors.dim, opacity: hero ? 1 : 0.55 }} />
      </div>
      <div style={{ width: valueW, textAlign: "right", fontFamily: T.fonts.en, fontSize: Math.max(28, fs(L, hero ? 32 : 28)), fontWeight: 800, color: hero ? T.colors.fg : T.colors.dim, fontVariantNumeric: "tabular-nums" }}>{fmtNumber(row.value, row.value * p, t.unit)}</div>
    </div>
  );
};

const TableTitle: React.FC<{ t: BenchTable; top: number }> = ({ t, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const s = spring({ frame: frame - 2, fps, config: { damping: 15, stiffness: 170 } });
  return (
    <div style={{ position: "absolute", left: L.chart.x, top, width: L.chart.w, fontFamily: T.fonts.cn, fontSize: fs(L, 32), fontWeight: 700, color: T.colors.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: Math.min(1, s * 2), translate: `${interpolate(s, [0, 1], [-30, 0])}px 0` }}>
      {t.name}
      {t.alias ? <span style={{ color: T.colors.dim, fontWeight: 500, marginLeft: 14 }}>· {t.alias}</span> : null}
      {t.lowerIsBetter ? <span style={{ fontSize: fs(L, 22), color: T.colors.accent2, marginLeft: 14, fontWeight: 600 }}>越低越好</span> : null}
    </div>
  );
};

/** One table, duel mode: hero vs best rival race, chip when decided, the rest collapse in small below. */
const Duel: React.FC<{ t: BenchTable }> = ({ t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const { hero, rival, rest, heroWins } = splitRows(t);
  const max = Math.max(...t.rows.map((r) => Math.abs(r.value))) * 1.04 || 1;
  const titleTop = L.chart.y + Math.round(70 * L.fontScale);
  const y0 = titleTop + Math.round(80 * L.fontScale);
  const rowGap = Math.round(122 * L.fontScale);
  const labelW = Math.round(L.chart.w * 0.55);
  const barW = L.chart.w;
  const heroDelay = 6;
  const rivalDelay = 9;
  const decided = rival ? passFrame(fps, hero.value, rival.value, Math.max(heroDelay, rivalDelay)) : 20;
  const chipS = spring({ frame: frame - decided, fps, config: { damping: 11, stiffness: 200 } });
  const chipTop = y0 + (rival ? rowGap * 2 : rowGap) + Math.round(6 * L.fontScale);
  const othersTop = chipTop + Math.round(84 * L.fontScale);
  const avail = L.chart.y + L.chart.h - othersTop - 40;
  const rowH = rest.length ? Math.max(30, Math.min(Math.round(50 * L.fontScale), Math.floor(avail / rest.length))) : 0;
  const noteTop = othersTop + rest.length * rowH + 14;
  return (
    <>
      <TableTitle t={t} top={titleTop} />
      <RaceRow row={hero} t={t} max={max} top={y0} delay={heroDelay} hero barW={barW} labelW={labelW} />
      {rival ? <RaceRow row={rival} t={t} max={max} top={y0 + rowGap} delay={rivalDelay} hero={false} barW={barW} labelW={labelW} /> : null}
      {rival ? (
        <div
          style={{
            position: "absolute",
            left: L.chart.x,
            top: chipTop,
            padding: `${Math.round(8 * L.fontScale)}px ${Math.round(22 * L.fontScale)}px`,
            borderRadius: 999,
            fontFamily: T.fonts.cn,
            fontSize: fs(L, 30),
            fontWeight: 800,
            color: heroWins ? (T.name === "paper" ? "#fff" : T.colors.bg) : "#fff",
            background: heroWins ? T.colors.accent : T.colors.danger,
            boxShadow: T.glow > 0 ? `0 0 26px ${heroWins ? T.colors.accent : T.colors.danger}99` : "0 6px 16px rgba(0,0,0,0.15)",
            opacity: frame < decided ? 0 : Math.min(1, chipS * 2),
            scale: String(interpolate(chipS, [0, 1], [0.5, 1])),
            transformOrigin: "left center",
            whiteSpace: "nowrap",
          }}
        >
          {deltaText(t, hero, rival)}
        </div>
      ) : null}
      {rest.map((r, i) => (
        <SmallRow key={r.model + i} row={r} t={t} max={max} top={othersTop + i * rowH} delay={decided + 10 + i * 4} rowH={rowH} hero={false} />
      ))}
      {t.note ? (
        <div style={{ position: "absolute", left: L.chart.x, width: L.chart.w, top: noteTop, fontFamily: T.fonts.cn, fontSize: fs(L, 22), color: T.colors.dim, opacity: interpolate(frame, [decided + 10, decided + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{t.note}</div>
      ) : null}
    </>
  );
};

/** One table, table mode: every row compact as a ≤ 1.5 s reference flash, then hold. */
const Table: React.FC<{ t: BenchTable }> = ({ t }) => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const T = useTheme();
  const { hero } = splitRows(t);
  const max = Math.max(...t.rows.map((r) => Math.abs(r.value))) * 1.04 || 1;
  const titleTop = L.chart.y + Math.round(70 * L.fontScale);
  const top = titleTop + Math.round(70 * L.fontScale);
  const avail = L.chart.y + L.chart.h - top - 50;
  const rowH = Math.max(34, Math.min(Math.round(64 * L.fontScale), Math.floor(avail / Math.max(1, t.rows.length))));
  return (
    <>
      <TableTitle t={t} top={titleTop} />
      {t.rows.map((r, i) => (
        <SmallRow key={r.model + i} row={r} t={t} max={max} top={top + i * rowH} delay={4 + i * 2} rowH={rowH} hero={r === hero} />
      ))}
      {t.note ? <div style={{ position: "absolute", left: L.chart.x, width: L.chart.w, top: top + t.rows.length * rowH + 12, fontFamily: T.fonts.cn, fontSize: fs(L, 22), color: T.colors.dim, opacity: interpolate(frame, [20, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{t.note}</div> : null}
    </>
  );
};

/** Benchmark scene: heading + one table at a time; two tables split by where the narration first mentions the second. */
export const Bench: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const b = payloadOf(beat, "bench");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tables = b.tables.map((key) => ({ key, t: tableOf(key) })).filter((x): x is { key: string; t: BenchTable } => x.t !== undefined);
  const n = Math.max(1, tables.length);
  // boundaries: proportion of the spoken span at which table i starts
  const props = tables.map((x, i) => {
    if (i === 0) return 0;
    const p = mentionProportion(beat.narration, [x.t.alias ?? "", x.t.name.split("·")[0] ?? "", x.key]);
    return Math.max((i - 0.5) / n, Math.min((i + 0.5) / n, p ?? i / n));
  });
  const spokenStart = info.vo !== null ? VO_LEAD * fps : 0;
  const spokenLen = info.vo !== null ? info.vo * fps : info.durationInFrames;
  const starts = props.map((p, i) => (i === 0 ? 0 : Math.round(spokenStart + p * spokenLen)));
  const head = spring({ frame: frame - 2, fps, config: { damping: 14, stiffness: 180 } });
  return (
    <SceneFrame beat={beat} info={info} footerExtra={b.footnote}>
      <div style={{ position: "absolute", left: L.chart.x, top: L.chart.y, width: L.chart.w, fontFamily: T.fonts.display, fontSize: fs(L, 44), fontWeight: 900, color: T.colors.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: Math.min(1, head * 2), translate: `${interpolate(head, [0, 1], [-40, 0])}px 0` }}>
        <span style={displayAccentStyle(T)}>跑分对比</span>
        <span style={{ margin: "0 14px", color: T.colors.dim }}>·</span>
        {b.heading}
      </div>
      {tables.map((x, i) => {
        const from = starts[i];
        const to = i + 1 < starts.length ? starts[i + 1] : info.durationInFrames;
        const dur = Math.max(1, to - from);
        return (
          <Sequence key={x.key} from={from} durationInFrames={dur} layout="none" name={`table ${x.key}`}>
            {b.mode === "table" ? <Table t={x.t} /> : <Duel t={x.t} />}
          </Sequence>
        );
      })}
      {tables.length === 0 ? <div style={{ position: "absolute", left: L.chart.x, top: L.hero.y, width: L.chart.w, textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 40), color: T.colors.danger }}>bench.json 缺少表 {b.tables.join(", ")}</div> : null}
    </SceneFrame>
  );
};
