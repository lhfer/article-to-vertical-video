# 一个创作核心，分别适配宿主与媒体提供者

每个宿主可以独立完成整条制作流程。Grok 也可以只作为其他宿主调用的图像／视频提供者。将宿主自带的读取文件、运行命令、预览媒体、询问用户等动作映射到它当前实际提供的工具。脚本接口保持一致。

| 宿主 | 推荐个人目录 | 项目目录 | 使用方式 |
|---|---|---|---|
| Claude Code | `~/.claude/skills/article-to-vertical-video` | `.claude/skills/article-to-vertical-video` | `/article-to-vertical-video` 或匹配的自然语言请求 |
| Cursor | `~/.cursor/skills/article-to-vertical-video` | `.cursor/skills/article-to-vertical-video` | 在当前技能列表选择，或明确指定技能与素材 |
| Grok Build CLI | `~/.grok/skills/article-to-vertical-video` | `.grok/skills/article-to-vertical-video` | 通过 `grok inspect` 查看实际发现项，再在会话中明确调用 |
| Codex（兼容入口） | `~/.agents/skills/article-to-vertical-video` | `.agents/skills/article-to-vertical-video` | `$article-to-vertical-video`；可使用附带 UI 元数据 |

`python3 <skill>/scripts/install.py --hosts claude,cursor,grok` 为本机建立指向同一目录的链接；已有安装会保留并提示。`--project <repo> --copy` 将实际文件复制到项目，适用于云端或跨机器工作。检查重复技能时先查实际发现路径与版本，再有针对性地整理旧安装。

## 当前宿主能力适配

- 路径：从本 SKILL.md 的实际位置解析 `<skill>`。Claude Code 可提供技能目录变量；公共命令和脚本直接使用已解析路径，其他宿主同样可运行。
- 用户确认：使用宿主可用的询问工具；没有专用工具时在对话中交付完整文案／样片并等待实际回复。继承当前对话已有确认。
- 文件交付：使用宿主原生附件／视频预览或实际绝对路径。远程机器路径仅在远程环境有效，使用其支持的下载或附件机制交付本地用户。
- 长渲染：优先使用宿主支持的长任务／会话句柄。回收该任务的退出码与日志，保持有意义的进度沟通；状态跟踪使用具体任务句柄或进程 pid。可恢复任务保存项目和日志。
- 图片／视频查看：优先使用实际图像或视频预览；截图／抽帧与音轨试听补充证据。只有静帧时，将完整运动与听感列为未验证。
- 生成媒体：所有宿主可以运行 `media.py` 调用已登录的 Grok CLI。Grok 自己具备可用媒体工具时，也可直接生成，再用 `--kind ingest` 登记输出。

## 能力探测与验证范围

`doctor.py` 检查本机可执行文件、版本和凭据是否可用；不会打印密钥。可执行文件存在、技能被发现、媒体工具可调用、真实生成成功、完整作品质量分别记录。用户的订阅授权与 API 计费通道分别使用，不把一种通道的可用性当作另一种已验证。

Grok 低层调用沿用 V2 的 `grok -p --tools ... --output-format streaming-json` 包装器。媒体能力与流式事件格式存在版本差异：看本机 `--help`，运行针对当前任务的能力检查；接口失败时保留任务日志，诊断原因，再使用宿主可用的直接工具或导入路径。

Cursor 桌面、CLI 与云端有不同资源环境。云端应使用项目内的实际文件并在执行机器配置依赖、Grok 登录与配音凭据；本机的绝对路径／软链接不能假定在云端存在。当前 Cursor 也支持特定个人技能同步选项，按实际设置确认。

## 真实宿主验收用例

各宿主分别在独立工作目录使用 `evals/evals.json` 的请求。第一轮应理解混合素材，交付完整脚本并停在真实确认点。明确批准脚本后应制作带声前十秒并停在第二确认点。之后完成三个画幅及检查。不同宿主可以有不同创作结果，使用相同观众标准和交付接口评审。

使用 CLI 读取／发现检查不等于跑过上述完整任务。查看交付的验证报告了解本包实际跑到哪一层。

## 官方依据（升级时重新核对）

- [Claude Code Skills](https://code.claude.com/docs/en/skills)：目录、显式调用与发现规则。
- [Cursor Skills](https://prod.cursor.com/docs/skills)：本地／项目目录及云端同步边界。
- [Grok Build](https://docs.x.ai/build/overview)：本地交互、headless 与 inspect。

V3 安装器以这些宿主自己的技能目录为默认入口，避免依赖某个宿主私有的工具名字或路径替换语法。
