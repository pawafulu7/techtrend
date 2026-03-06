import { UsersTable } from './_components/users-table';

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ユーザー管理</h1>
        <p className="text-muted-foreground">
          ユーザーアカウントとロールを管理します。
        </p>
      </div>
      <UsersTable />
    </div>
  );
}
