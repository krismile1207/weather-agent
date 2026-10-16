function createApiError(payload, fallbackMessage, status) {
  const error = new Error(payload?.msg || fallbackMessage);
  error.status = status;
  error.code = payload?.code || status || 500;
  error.requestId = payload?.requestId || "";
  return error;
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const envelope = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createApiError(envelope, "请求失败", response.status);
  }
  if (
    !envelope
    || typeof envelope !== "object"
    || envelope.code !== 200
    || !("data" in envelope)
  ) {
    throw createApiError(envelope, "服务端返回格式不正确", response.status);
  }
  // 页面只消费业务数据，业务码、追踪 ID 等协议字段统一由请求层处理。
  return envelope.data;
}

/**
 * 读取服务端按行发送的聊天流。
 * @param {string} path API 路径。
 * @param {RequestInit} options fetch 请求选项，聊天请求通常包含 JSON body。
 * @param {(event: {type: 'delta'|'done', code?: number, content?: string, title?: string, requestId?: string, timestamp?: string}) => void} onEvent 每收到一个完整事件时执行的回调。
 * @returns {Promise<{type: 'done', code: 200, title: string, requestId: string, timestamp: string}>} 服务端发送的结束事件。
 */
export async function streamApi(path, options = {}, onEvent) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const envelope = await response.json().catch(() => ({}));
    throw createApiError(envelope, "请求失败", response.status);
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
    if (event.type === "error") {
      throw createApiError(event, "流式请求失败", response.status);
    }
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
