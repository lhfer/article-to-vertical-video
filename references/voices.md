# Voices

## Rule: one voice for the account, on every host

The audience recognizes the voice before the badge. The account voice is **Seed-TTS 2.0 清爽男大
(`zh_male_qingshuangnanda_uranus_bigtts`), speech_rate 28, style string below** — the same REST call from
Claude Code, Cursor, Codex, Gemini CLI and Grok Build (`scripts/tts_seed2.py`, key `SEED_AUDIO_KEY`). Do not
switch voices between videos or hosts; do not pick a different voice for the short cut. `brief.tts` records
speaker, rate and style so every project carries the same values.

## Seed-TTS 2.0 voices that were tested (火山引擎 豆包语音)

All via `tts_seed2.py --speaker <id>`; resource id `seed-tts-2.0`; key = `SEED_AUDIO_KEY` (X-Api-Key).

| id | name | verdict from the user |
|---|---|---|
| `zh_male_qingshuangnanda_uranus_bigtts` | 清爽男大 | **chosen**: young, casual, first-person social media |
| `zh_male_yangguangqingnian_uranus_bigtts` | 阳光青年 | works, slightly brighter |
| `zh_male_dayi_uranus_bigtts` | 大毅 | works, a little deeper |
| `zh_male_liufei_uranus_bigtts` | 刘飞 | works; user found it "老气" for 小红书 |
| `zh_female_vv_uranus_bigtts` | vv | default female 2.0 voice per docs (untested here) |

Speech rate: 28 for social-media narration (~8.4 chars/s). Style string default:
青春活泼的大学生男生口吻，像在跟同学第一人称分享刚看到的新鲜事，语速快、有起伏、带着笑意和兴奋感，随意自然.
For a formal/trailer read the user rejected: 低沉有力、电影预告片式 — avoid for 小红书 content. Tone goes in the
style string (`brief.tts.style`), never as stage directions inside the narration text.

## Process that worked

Generate ONE sample line first when the user has not heard the voice
(`python3 <skill>/scripts/tts_seed2.py <workdir>/project --sample "…" --out ../out/sample.mp3`), hand the
mp3 to the user per `references/hosts.md`, let them react, then generate the full set. Never render the
video to audition a voice. After edits, `--only id1,id2 --force` regenerates just those beats.

## Fallback only: xAI Voice

If Seed-TTS is unreachable (key revoked, 55000000 resource errors that persist, regional outage) and the
user agrees, `brief.tts.provider: "xai"` with a preset voice — `castor` (male, closest in age and energy to
清爽男大) or `leo` (male, a little deeper). Say in the report that this video uses the fallback voice; switch
back to Seed-TTS for the next one. The default never changes.
