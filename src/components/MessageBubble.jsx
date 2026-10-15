import { Avatar } from "antd";
import { CloudOutlined, UserOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";

/**
 * 单条聊天消息。
 * @param {{ message: {id: string, role: 'user'|'assistant', content: string}, pending?: boolean }} props
 * @param props.message 消息主体；role 决定头像、对齐方式和气泡样式。
 * @param props.pending 是否显示 Agent 正在思考的占位状态。
 */
export default function MessageBubble({ message, pending = false }) {
  const isUser = message.role === "user";
  return (
    <article className={`message-row ${isUser ? "user" : "assistant"}`}>
      <Avatar className="message-avatar" icon={isUser ? <UserOutlined /> : <CloudOutlined />} />
      <div className="message-body">
        <span className="message-author">{isUser ? "你" : "云迹"}</span>
        <div className="message-bubble">
          {pending ? (
            <div className="typing"><i /><i /><i /><span>正在查看天气与记忆…</span></div>
          ) : (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          )}
        </div>
      </div>
    </article>
  );
}
