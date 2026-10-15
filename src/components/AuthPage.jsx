import { useState } from "react";
import { Alert, Button, Form, Input, Segmented, Typography } from "antd";
import { ArrowRightOutlined, CloudOutlined, LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { api } from "../api.js";

/**
 * 登录注册页。
 * @param {{ onAuthenticated: (user: {id: string, name: string, email: string}) => void }} props
 * @param props.onAuthenticated 登录或注册成功后回传当前用户。
 */
export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (values) => {
    setLoading(true);
    setError("");
    try {
      const data = await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      onAuthenticated(data.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="story-content">
          <div className="story-brand"><CloudOutlined /> 云迹</div>
          <Typography.Title className="story-title">天气不只是一组数字，<br />也是每次出发前的答案。</Typography.Title>
          <Typography.Paragraph className="story-copy">
            查询实时天气、未来趋势和出行建议。云迹会记住你的常用地点与偏好，让每次回答更懂你。
          </Typography.Paragraph>
          <div className="mini-forecast" aria-hidden="true">
            <div><span>现在</span><strong>24°</strong><small>体感舒适</small></div>
            <div><span>明天</span><strong>☀</strong><small>晴 18~27°</small></div>
            <div><span>周五</span><strong>☂</strong><small>带一把伞</small></div>
          </div>
        </div>
        <div className="sun-halo" />
        <div className="cloud-shape cloud-one" />
        <div className="cloud-shape cloud-two" />
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand"><CloudOutlined /> 云迹天气</div>
          <Typography.Title level={2}>{mode === "login" ? "欢迎回来" : "创建你的账号"}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {mode === "login" ? "登录后继续你的天气对话" : "你的偏好只会保存在你的账号下"}
          </Typography.Paragraph>
          <Segmented
            block
            value={mode}
            onChange={(value) => { setMode(value); setError(""); }}
            options={[{ label: "登录", value: "login" }, { label: "注册", value: "register" }]}
          />
          {error && <Alert className="auth-error" message={error} type="error" showIcon />}
          <Form layout="vertical" requiredMark={false} onFinish={submit} size="large">
            {mode === "register" && (
              <Form.Item name="name" label="昵称" rules={[{ required: true, message: "请输入昵称" }, { min: 2, max: 30 }]}> 
                <Input prefix={<UserOutlined />} placeholder="怎么称呼你" autoComplete="name" />
              </Form.Item>
            )}
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}> 
              <Input prefix={<MailOutlined />} placeholder="name@example.com" autoComplete="email" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }, { min: 8, message: "至少 8 位" }]}> 
              <Input.Password prefix={<LockOutlined />} placeholder="至少 8 位" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block className="auth-submit">
              {mode === "login" ? "登录" : "注册并开始"} <ArrowRightOutlined />
            </Button>
          </Form>
          <p className="security-note"><LockOutlined /> 密码加密存储，登录凭证不会暴露给前端脚本</p>
        </div>
      </section>
    </main>
  );
}
