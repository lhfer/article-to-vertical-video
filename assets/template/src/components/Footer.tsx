import React from "react";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { META } from "../content";

/** Small data-source line at layout.footerY. */
export const Footer: React.FC<{ text?: string; extra?: string }> = ({ text, extra }) => {
  const L = useLayout();
  const T = useTheme();
  const t = `${text ?? META.footer}${extra ? ` · ${extra}` : ""}`;
  if (!t.trim()) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: L.safe.left,
        width: L.W - L.safe.left - L.safe.right,
        top: L.footerY,
        fontFamily: T.fonts.cn,
        fontSize: fs(L, 18),
        color: T.colors.dim,
        textAlign: "center",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        letterSpacing: 1,
      }}
    >
      {t}
    </div>
  );
};
