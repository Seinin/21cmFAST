/**
 * 本机视图偏好（localStorage）。
 *
 * 与 `usePanelWidth` 同一套口径：**只存界面偏好，绝不进入图谱数据或撤销栈**；
 * 读取一律容错——缺失、非法 JSON、类型不对、隐私模式禁用存储，全部回退默认值，
 * 不抛错。这类代码跑在渲染之前，抛错就是白屏。
 *
 * 与面板宽度的那份实现刻意分开：那边以「一个 hook 管一个组件」为形态，
 * 而这里的隐藏集合要被画布、右键菜单、属性面板三处同时读，状态源在 store 里，
 * 只需要一对纯函数做读写。两处口径相同，但不强行合并（合并就得改动既有成果）。
 */

/** 按模块收起的关系：本机记住的模块 id 列表 */
export const HIDDEN_RELATIONS_KEY = 'graphify.hiddenRelations.v1'

/**
 * 读一个字符串数组偏好。
 * `window` 不存在时（自检脚本跑在 Node 里）直接给空数组——不靠 `try/catch`
 * 去接 `ReferenceError`，那是拿异常当控制流。
 */
export function readStringArrayPreference(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    // 隐私模式、存储被禁用或内容损坏：一律当作没存过
    return []
  }
}

/**
 * 写一个字符串数组偏好。
 * 空集合就是「全部显示」，此时直接删键——免得留一个谁都看不懂的 `[]`。
 * 写失败只影响「下次打开的记忆」，不影响本次会话，因此静默吞掉。
 */
export function writeStringArrayPreference(key: string, values: readonly string[]): void {
  if (typeof window === 'undefined') return
  try {
    if (!values.length) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify([...values]))
  } catch {
    // 同上：存储不可用时不影响本次会话
  }
}
