# 可运行的导演工程

需要 Node 20+、npm、Python 3.9+、ffmpeg/ffprobe。网页提取按需使用 uv；Grok 图像转换需要 Pillow。`assets/director` 提供运行骨架与一个 12 秒接口演示。演示用于测试，正式项目从当前素材设计内容。

```bash
python3 <skill>/scripts/project.py init <work>
cd <work>/project
npm ci
python3 <skill>/scripts/project.py compile <work>/project --draft
npm run check
python3 <skill>/scripts/render.py <work>/project --stage draft --format all
```

## 内容与实现

`brief.json` 存账号偏好，`script.json` 存完整文案，`visual.json` 存本片创意。`film.json` 安排镜头与音轨，`alignment.json` 存实测时码，`timeline.json` 是编译产物。`sources.json` 与 `claims.json` 保存证据身份。修改编译输入后重新编译。

口播段落示例（这里是结构示例，正式文案由用户确认）：

```json
{"version":3,"title":"资料为什么难找","viewerPromise":"理解一个常见的资料管理问题","thesis":"根据本次材料形成的判断","beats":[{"id":"open","narration":"收藏之后，为什么还是找不到？","viewerGain":"建立具体问题","claims":[]}]}
```

一个口播段可以覆盖多个镜头，一个镜头也可以连接多个口播段。`voice` 可按段覆盖 `rate` 或 `style`，继承账号声线。

## 先确认全文，再制作开头

```bash
python3 <skill>/scripts/project.py script <project>
# 将 out/script-review.md 交给用户；收到实际确认后记录
python3 <skill>/scripts/review.py approve <project> script --evidence '本次实际用户确认'
python3 <skill>/scripts/tts_seed2.py <project> --only open
```

TTS 读取环境里的 `SEED_AUDIO_KEY`，沿用 Seed 2.0 接口。`--dry-run` 只打印计划。相同稿件、声线、风格与音频文件指纹可以复用，修改的段落单独重配，旧音频保存在工程的 work 目录。

## 对齐实际发音

优先使用配音服务提供的可靠词级时码；也可使用可靠的外部强制对齐器，再导入。没有时码时，使用本机 Whisper 初步转写，听实际音频修正文本与关键边界。Whisper 转写不是强制对齐，读错／同音字／数字和英文需要检查。

```bash
python3 <skill>/scripts/align.py transcribe <project> --id open --model <local-ggml-model.bin>
# 或导入以毫秒为单位的实际词／短语时间戳
python3 <skill>/scripts/align.py import <project> --id open --words <measured-words.json> --method provider
# 听音、核对文字与关键动作时间后记录检查
python3 <skill>/scripts/align.py review <project> --id open --note '实际听音与修正记录'
```

导入数组形状遵循 Remotion Caption：

```json
[{"text":"收藏之后，","startMs":210,"endMs":950,"timestampMs":null,"confidence":null},{"text":"为什么还是找不到？","startMs":1150,"endMs":2490,"timestampMs":null,"confidence":null}]
```

也可导入 `{"words":[...],"captions":[...]}`，将细粒度时间戳与可读字幕分组分别保存。上述数值仅展示结构；正式时间戳来自当前音频。词组级时码的精度仅到该词组边界，需要词内精确动作时补充更细时码。已有时码保持原值；字幕分组引用首尾词时间，显示样式由构图决定。

`alignment.json` 记录音频与文案的 SHA256。合成变化后验证会提示重新对齐。任何审核记录都应对应实际完成的检查。

## 单一时间轴

```json
{
  "version":3,"scope":"opening","fps":30,
  "components":{"MyShot":"shots/MyShot.tsx"},
  "voices":[{"id":"open","at":0.2}],
  "events":{"reveal":{"voice":"open","word":"找不到","edge":"start"}},
  "shots":[{"id":"opening","component":"MyShot","start":0,"end":10,
    "props":{},"viewerGain":"具体问题变得可见",
    "layouts":{"3x4":{},"9x16":{},"16x9":{}},"assets":[]}],
  "assets":{},"audio":[],"captions":{"enabled":true}
}
```

`scope: opening` 允许仅排入已完成的开头旁白；全片制作后改为 `full`，编译器检查全部口播都被安排。开头工程至少覆盖前十秒；全片确实不足十秒时展示全片。

时间引用可为秒数，或 `{"event":"reveal","offset":0.15}`。事件还支持 `voice-start / voice-end`、`wordIndex`、`occurrence`（同一词第几次出现）、`edge: end`。下段音轨起点可用 `{"after":"open","offset":0.2}`，按实际音频结束继续。

镜头 start/end 是明确的全局时间。两个镜头可以重叠，编译器对所有轨道只换算一次帧坐标；分镜表和渲染器读取相同结果。`transitionIn: {"type":"fade","seconds":0.4}` 要求上一镜覆盖该重叠区间。`custom` 的视觉过程由镜头代码实现，`cut` 是直接切换。支持任意自定义动作而不扩充模板枚举。

`film.audio` 每条包含 `src,start,end,gain`，可附 `trimStart,fadeIn,fadeOut,duck`。时间单位为秒，gain 与 duck 为线性音量；`duck` 如 0.35 表示旁白附近衰减至本底音量的 35%。保留足够音源长度。旁白与音乐独立于镜头，不因转场发生剪短或重复。

## 镜头组件

在 `film.components` 将唯一组件名映射到 `src/shots/` 内文件；组件使用默认导出。编译器生成 `registry.generated.ts`，组件内部可自由扩展。新依赖安装在项目中，并固定版本。

```tsx
import {useCurrentFrame,interpolate} from 'remotion';
import type {ShotProps} from '../types';
export default function MyShot({layout,cue}:ShotProps){
  const frame=useCurrentFrame();
  const reveal=cue('reveal'); // 全局语义事件换算成当前镜头的局部帧
  return <div style={{fontSize:Number(layout.fontSize??72),opacity:interpolate(frame,[reveal,reveal+12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>当前镜头的表达</div>;
}
```

`ShotProps` 还提供画幅 `format`、当前构图 `layout`、镜头数据 `shot`、全局事件和本片风格。引用的媒体登记在 `film.assets`，每镜在 `assets` 中列出所用 id；全片字体等登记为 `globalAssets`。这样前十秒审核能追踪实际影响它的素材。共享字幕可以按画幅设置 bottom/fontSize/maxWidth/color/background，或在片中有意选择其它字幕设计。

组件可用 `staticFile(asset('demo'))` 取得已登记素材的播放路径。字体在 `film.style.fonts` 中配置 `[{"family":"DirectorSans","asset":"font-main","weight":"600"}]`，并用 `film.style.fontFamily` 选择该字体。先将字体文件与其许可保存到工程，登记文件 id 到 assets/globalAssets，实际渲染核对中文字形；使用本地固定字体有助于跨机器保持一致。

## 阶段渲染

```bash
python3 <skill>/scripts/project.py compile <project>
python3 <skill>/scripts/project.py validate <project>
cd <project>
npm run check
python3 <skill>/scripts/render.py <project> --stage opening --format 3x4
# 收到实际用户确认后
python3 <skill>/scripts/review.py approve <project> opening --evidence '本次实际用户确认'
# 完成全片，scope=full
python3 <skill>/scripts/render.py <project> --stage preview --format all
python3 <skill>/scripts/render.py <project> --stage final --format all
```

最终输出 `out/final-3x4.mp4`、`out/final-9x16.mp4`、`out/final-16x9.mp4`。默认预览 0.5 倍、最终 1 倍。旧渲染自动归档到 `out/versions`。技术草稿带标记且可以无配音，正式阶段要求真实音频和相应确认。

因共享实现调整而使开头指纹变化时，先按原预览比例重渲染前十秒，再用 `review.py carry-opening <project>` 比较新旧样片。画面与音频完全相同可以继承原用户确认；实际变化则需要用户重新看样片。

## 参考依据

- [Remotion Sequence](https://www.remotion.dev/docs/sequence)：显式帧调度。
- [Remotion Caption](https://www.remotion.dev/docs/captions/caption)：实际毫秒时码的数据结构。
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)：本地转写工具与词级时间戳功能。

本包使用与 V2 相同的固定 Remotion 4.0.520 依赖作为可验证基线。后续升级库版本时运行类型检查、时间轴测试与实际三画幅渲染。
