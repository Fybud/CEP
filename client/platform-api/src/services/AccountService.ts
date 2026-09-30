export class AccountService {
  /** Single-tenant workspace stub — accounts table removed. */
  static async list() {
    return [{ id: "workspace", name: "Workspace" }];
  }

  static async getById(id: string) {
    if (id !== "workspace") return null;
    return { id: "workspace", name: "Workspace" };
  }
}
