import crypto from "node:crypto";

export class PostgresMemoryAdapter {
  constructor(store) {
    this.store = store;
  }

  namespace(userId) {
    // 用户 ID 作为命名空间的一段，确保跨会话共享、跨用户严格隔离。
    return ["users", String(userId), "memories"];
  }

  async list(userId, limit = 20) {
    const items = await this.store.search(this.namespace(userId), { limit });
    return items.map((item) => ({ id: item.key, ...item.value }));
  }

  async save(userId, { content, category = "preference" }) {
    const normalized = String(content || "").trim().slice(0, 500);
    if (!normalized) throw new Error("记忆内容不能为空");

    const namespace = this.namespace(userId);
    const existingItems = await this.store.search(namespace, { limit: 100 });
    const duplicate = existingItems.find(
      (item) =>
        item.value.category === category &&
        String(item.value.content || "").trim().toLocaleLowerCase() ===
          normalized.toLocaleLowerCase(),
    );
    if (duplicate) {
      return { key: duplicate.key, content: normalized, category, created: false };
    }

    const now = new Date().toISOString();
    if (category === "preferred_name") {
      const previousNames = existingItems.filter(
        (item) => item.value.category === "preferred_name",
      );
      if (previousNames.length > 0) {
        const [currentName, ...staleNames] = previousNames;
        // 姓名属于单值记忆：改名时复用原键并清理旧副本，避免后续对话出现多个冲突称呼。
        await this.store.put(namespace, currentName.key, {
          content: normalized,
          category,
          createdAt: currentName.value.createdAt || now,
          updatedAt: now,
        });
        await Promise.all(
          staleNames.map((item) => this.store.delete(namespace, item.key)),
        );
        return {
          key: currentName.key,
          content: normalized,
          category,
          created: false,
          updated: true,
        };
      }
    }

    const key = crypto.randomUUID();
    await this.store.put(namespace, key, {
      content: normalized,
      category,
      createdAt: now,
    });
    return { key, content: normalized, category, created: true };
  }
}
