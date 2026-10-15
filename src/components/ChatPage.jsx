import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Drawer, Select, Tooltip, message as antMessage } from "antd";
import {
  ArrowUpOutlined,
  BulbOutlined,
  CloudOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { api, streamApi } from "../api.js";
import Sidebar from "./Sidebar.jsx";
import MessageBubble from "./MessageBubble.jsx";

const suggestions = [
  "上海未来三天会下雨吗？",
  "北京今天适合户外跑步吗？",
  "记住我常住杭州，怕冷",
  "周末去成都旅行该怎么穿？",
];

/**
 * 主聊天页面。
 * @param {object} props
 * @param {{id: string, name: string, email: string}} props.user 当前登录用户，服务端仍会独立校验身份。
 * @param {() => Promise<void>} props.onLogout 退出登录回调。
 */
export default function ChatPage({ user, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const scrollRef = useRef(null);

  const loadConversations = useCallback(async () => {
    const data = await api("/api/conversations");
    setConversations(data.conversations);
    return data.conversations;
  }, []);

  useEffect(() => {
    Promise.all([api("/api/models"), loadConversations()])
      .then(([modelData, conversationData]) => {
        setModels(modelData.models);
        const available = modelData.models.find((model) => model.configured) || modelData.models[0];
        setModelId(available?.id || "");
        if (conversationData[0]) setActiveId(conversationData[0].id);
      })
      .catch((error) => setFatalError(error.message));
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    api(`/api/conversations/${activeId}/messages`)
      .then((data) => {
        setMessages(data.messages);
        const conversation = conversations.find((item) => item.id === activeId);
        // 历史会话可能保存已下线的云端模型，只有仍在当前模型列表中时才恢复其选择。
        if (models.some((model) => model.id === conversation?.modelId && model.configured)) {
          setModelId(conversation.modelId);
        }
      })
      .catch((error) => antMessage.error(error.message));
  }, [activeId, conversations, models]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const requestConversation = useCallback(async () => {
    if (!modelId) return null;
    const data = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ modelId }),
    });
    setConversations((current) => [data.conversation, ...current]);
    return data.conversation;
  }, [modelId]);

  const createConversation = useCallback(async () => {
    const conversation = await requestConversation();
    if (!conversation) return null;
    setActiveId(conversation.id);
    setMessages([]);
    setSidebarOpen(false);
    return conversation.id;
  }, [requestConversation]);

  const sendMessage = useCallback(async (preset) => {
    const content = String(preset ?? draft).trim();
    if (!content || sending) return;
    const selectedModel = models.find((model) => model.id === modelId);
    if (!selectedModel?.configured) {
      antMessage.warning("该模型尚未配置，请检查服务端环境变量或本地模型服务");
      return;
    }

    setDraft("");
    setSending(true);
    setStreamStarted(false);
    const optimistic = { id: `local-${Date.now()}`, role: "user", content };
    const replyId = `reply-${Date.now()}`;
    setMessages((current) => [...current, optimistic]);
    try {
      const isNewConversation = !activeId;
      const conversationId = activeId || (await requestConversation())?.id;
      if (!conversationId) throw new Error("无法创建新对话");

      const doneEvent = await streamApi("/api/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId, modelId, message: content }),
      }, (event) => {
        if (event.type !== "delta" || !event.content) return;
        setStreamStarted(true);
        setMessages((current) => {
          const existing = current.some((item) => item.id === replyId);
          if (!existing) {
            return [...current, { id: replyId, role: "assistant", content: event.content }];
          }
          return current.map((item) => item.id === replyId
            ? { ...item, content: item.content + event.content }
            : item);
        });
      });
      setConversations((current) => current
        .map((item) => item.id === conversationId ? { ...item, title: doneEvent.title, modelId } : item)
        .sort((a, b) => a.id === conversationId ? -1 : b.id === conversationId ? 1 : 0));
      // 新会话等流结束后再激活，避免加载空历史的请求覆盖正在追加的消息。
      if (isNewConversation) setActiveId(conversationId);
    } catch (error) {
      antMessage.error(error.message);
      setMessages((current) => current.filter(
        (item) => item.id !== optimistic.id && item.id !== replyId,
      ));
      setDraft(content);
    } finally {
      setSending(false);
      setStreamStarted(false);
    }
  }, [activeId, draft, modelId, models, requestConversation, sending]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const modelOptions = useMemo(() => models.map((model) => ({
    value: model.id,
    disabled: !model.configured,
    label: <span>{model.label} <small className="model-desc">{model.configured ? model.description : "未配置"}</small></span>,
  })), [models]);

  const sidebarProps = {
    conversations,
    activeId,
    onSelect: (id) => { setActiveId(id); setSidebarOpen(false); },
    onNew: createConversation,
    onCollapse: () => setSidebarOpen(false),
    user,
    onLogout,
  };

  return (
    <main className="chat-shell">
      <div className="desktop-sidebar"><Sidebar {...sidebarProps} /></div>
      <Drawer placement="left" width={300} open={sidebarOpen} closable={false} onClose={() => setSidebarOpen(false)} styles={{ body: { padding: 0 } }}>
        <Sidebar {...sidebarProps} />
      </Drawer>

      <section className="chat-main">
        <header className="chat-header">
          <div className="header-left">
            <Button className="mobile-menu" type="text" icon={<MenuUnfoldOutlined />} onClick={() => setSidebarOpen(true)} />
            <div><strong>{conversations.find((item) => item.id === activeId)?.title || "新的天气对话"}</strong><span><i /> 实时天气服务在线</span></div>
          </div>
          <div className="header-actions">
            <span className="model-label">模型</span>
            <Select value={modelId || undefined} options={modelOptions} onChange={setModelId} popupMatchSelectWidth={240} placeholder="选择模型" />
            <Tooltip title="新对话"><Button className="header-new" icon={<PlusOutlined />} onClick={createConversation} /></Tooltip>
          </div>
        </header>

        {fatalError ? <Alert className="fatal-alert" type="error" showIcon message={fatalError} /> : null}
        <div className="messages-scroll" ref={scrollRef}>
          {messages.length === 0 && !sending ? (
            <section className="welcome-state">
              <div className="welcome-icon"><CloudOutlined /></div>
              <p className="eyebrow">WEATHER, WITH MEMORY</p>
              <h1>你好，{user.name}<br />今天想了解哪里的天气？</h1>
              <p className="welcome-copy">我能查询实时天气和 7 日预报，也会记住你的常用地点与出行偏好。</p>
              <div className="suggestion-grid">
                {suggestions.map((suggestion, index) => (
                  <button type="button" key={suggestion} onClick={() => sendMessage(suggestion)}>
                    {index === 2 ? <BulbOutlined /> : <CloudOutlined />}
                    <span>{suggestion}</span><ArrowUpOutlined rotate={45} />
                  </button>
                ))}
              </div>
              <div className="privacy-pill"><SafetyCertificateOutlined /> 记忆按账号隔离存储，你可以随时开启新对话</div>
            </section>
          ) : (
            <div className="messages-list">
              {messages.map((item) => <MessageBubble key={item.id} message={item} />)}
              {sending && !streamStarted && <MessageBubble pending message={{ id: "pending", role: "assistant", content: "" }} />}
            </div>
          )}
        </div>

        <footer className="composer-wrap">
          <div className="composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="问问今天的天气、未来降雨或出行建议…"
              rows={1}
              maxLength={2000}
              disabled={sending}
            />
            <Button
              aria-label="发送"
              type="primary"
              shape="circle"
              icon={<ArrowUpOutlined />}
              onClick={() => sendMessage()}
              loading={sending}
              disabled={!draft.trim()}
            />
          </div>
          <p>Enter 发送 · Shift + Enter 换行 · 天气数据由 Open-Meteo 提供</p>
        </footer>
      </section>
    </main>
  );
}
