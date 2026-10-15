export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "请求失败");
    error.status = response.status;
    throw error;
  }
  return data;
}

/**
 * 读取服务端按行发送的聊天流。
 * @param {string} path API 路径。
 * @param {RequestInit} options fetch 请求选项，聊天请求通常包含 JSON body。
 * @param {(event: {type: 'delta'|'done', content?: string, title?: string}) => void} onEvent 每收到一个完整事件时执行的回调。
 * @returns {Promise<{type: 'done', title?: string}>} 服务端发送的结束事件。
 */
export async function streamApi(path, options = {}, onEvent) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.message || "请求失败");
    error.status = response.status;
    throw error;
  }
  if (!response.body) throw new Error("当前浏览器不支持流式响应");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent = null;

  const consumeLine = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error("服务端返回了无法解析的流式数据");
    }
    if (event.type === "error") throw new Error(event.message || "流式请求失败");
    if (event.type === "done") doneEvent = event;
    onEvent?.(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(consumeLine);
    if (done) break;
  }
  if (buffer) consumeLine(buffer);
  if (!doneEvent) throw new Error("流式响应意外中断");
  return doneEvent;
}
