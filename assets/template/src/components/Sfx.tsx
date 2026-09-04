import React from "react";
import { staticFile } from "remotion";
import { Audio } from "@remotion/media";
import type { SfxKind } from "../types";
import { hasStatic, sfxFile } from "../assets";

/** Mounts public/sfx/<name>.wav when it exists (make_sfx.py writes whoosh/hit/riser/tick). Silent otherwise. */
export const Sfx: React.FC<{ name: SfxKind; volume?: number }> = ({ name, volume = 0.8 }) => {
  if (name === "none") return null;
  const file = sfxFile(name);
  if (!hasStatic(file)) return null;
  return <Audio src={staticFile(file)} volume={volume} name={`sfx ${name}`} />;
};
