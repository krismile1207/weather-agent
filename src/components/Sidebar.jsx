import { Avatar, Button, Dropdown, Tooltip } from "antd";
import {
  CloudOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MessageOutlined,
  MoreOutlined,
  PlusOutlined,
} from "@ant-design/icons";

/**
 * 对话侧栏。
 * @param {object} props
 * @param {Array<{id: string, title: string, modelId: string}>} props.conversations 用户可访问的会话列表。
 * @param {string|null} props.activeId 当前会话 ID；null 表示尚未创建会话。
 * @param {(id: string) => void} props.onSelect 切换会话。
 * @param {() => void} props.onNew 创建新会话。
 * @param {() => void} props.onCollapse 在小屏幕收起侧栏。
 * @param {{name: string, email: string}} props.user 当前登录用户。
 * @param {() => void} props.onLogout 退出登录。
 */
export default function Sidebar({ conversations, activeId, onSelect, onNew, onCollapse, user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-brand"><span><CloudOutlined /></span> 云迹</div>
        <Tooltip title="收起侧栏"><Button type="text" icon={<MenuFoldOutlined />} onClick={onCollapse} /></Tooltip>
      </div>
      <Button className="new-chat-btn" icon={<PlusOutlined />} onClick={onNew}>新对话</Button>
      <div className="conversation-label">最近对话</div>
      <nav className="conversation-list">
        {conversations.length === 0 && <div className="conversation-empty">你的天气对话会出现在这里</div>}
        {conversations.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`conversation-item ${activeId === item.id ? "active" : ""}`}
            onClick={() => onSelect(item.id)}
          >
            <MessageOutlined />
            <span>{item.title}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-user">
        <Avatar>{user.name.slice(0, 1).toUpperCase()}</Avatar>
        <div><strong>{user.name}</strong><small>{user.email}</small></div>
        <Dropdown menu={{ items: [{ key: "logout", label: "退出登录", icon: <LogoutOutlined />, onClick: onLogout }] }} trigger={["click"]}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      </div>
    </aside>
  );
}
