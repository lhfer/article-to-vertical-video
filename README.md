# article-to-vertical-video V3

面向普通科技与 AI 爱好者的科技视频创作 skill。3:4 主版，同时交付 9:16、16:9；内容决定时长。完整文案与前十秒动态样片由用户确认，其余制作自主完成。

## 下载与验证

- [下载 V3 安装包](https://github.com/lhfer/article-to-vertical-video/releases/download/v3.0.0/article-to-vertical-video-v3.zip)
- [V3 升级与验证说明](docs/v3-upgrade.md)
- [V2 历史版本](https://github.com/lhfer/article-to-vertical-video/tree/v2.0.0)

## 安装

将本目录解压到希望长期保存的位置。先检查已有安装，再选择宿主安装；安装器会保留已有目录。

```bash
python3 scripts/doctor.py
python3 scripts/install.py --hosts claude,cursor,grok --dry-run
python3 scripts/install.py --hosts claude,cursor,grok
```

项目／云端使用：`python3 scripts/install.py --hosts cursor --project <project-root> --copy`。Codex 可加入 `--hosts codex`。宿主入口、凭据与运行差异见 [hosts](references/hosts.md)。

## 开始使用

在所选 Agent 中指定本 skill，提供链接、文件、录屏或想法，例如：“把这些材料做成面向普通用户的科技视频，先给我完整文案。”

本包包含创作指导、开放 Remotion 骨架、数据／媒体／审核工具、测试与四类行为评测。运行入口在 [SKILL.md](SKILL.md)，详细工程步骤在 [runtime](references/runtime.md)。配音使用已有 Seed 声线，读取环境变量 `SEED_AUDIO_KEY`；Grok 生成使用当前机器的已登录 CLI。

## 维护验证

```bash
node --test tests/timeline.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
cd assets/director
npm ci
npm run check
npm run compile:draft
```

完整的离线三画幅音轨测试：安装依赖后，从技能根目录运行 `python3 tests/render_smoke.py --workdir <fresh-test-directory>`；附 `--scale 1` 可验证目标交付尺寸。测试使用合成音调和明确标记的测试确认记录，仅验证工程行为。

V3 是新的导演工程，不会直接覆盖旧 V2 项目。现有 V2 视频继续用原工程重渲染；迁移时在新工程复用原文案与媒体，重新安排镜头和实际音频时码。旧版的固定模板规范没有被带入新默认流程。
