import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/auth-context-value";
import { InviteUser } from "@components/auth/invite-user";
import type { UserProfile } from "@services/auth-service";
import {
  UserAdminService,
  type PortfolioSummary,
  type PortfolioAccessEntry,
} from "@services/user-admin-service";
import { useToast } from "@/contexts/toast-context-value";

function Users() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [access, setAccess] = useState<PortfolioAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = profile?.role === "admin";

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [userRows, portfolioRows, accessRows] = await Promise.all([
        UserAdminService.listUsers(),
        UserAdminService.listPortfolios(),
        UserAdminService.listPortfolioAccess(),
      ]);
      setUsers(userRows);
      setPortfolios(portfolioRows);
      setAccess(accessRows);
    } catch (err) {
      console.error("Failed to load users:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isAdmin, loadData]);

  const hasAccess = (userId: string, portfolioId: number) =>
    access.some((a) => a.user_id === userId && a.portfolio_id === portfolioId);

  const handleRoleChange = async (userId: string, role: "admin" | "member") => {
    const previous = users;
    setUsers((rows) => rows.map((u) => (u.id === userId ? { ...u, role } : u)));
    try {
      await UserAdminService.setUserRole(userId, role);
      showToast({ title: "Role updated", type: "success" });
    } catch (err) {
      console.error("Failed to update role:", err);
      setUsers(previous);
      showToast({
        title: "Failed to update role",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    }
  };

  const handleAccessToggle = async (userId: string, portfolioId: number, granted: boolean) => {
    const previous = access;
    setAccess((rows) =>
      granted
        ? [...rows, { user_id: userId, portfolio_id: portfolioId }]
        : rows.filter((a) => !(a.user_id === userId && a.portfolio_id === portfolioId))
    );
    try {
      if (granted) {
        await UserAdminService.grantPortfolioAccess(userId, portfolioId);
      } else {
        await UserAdminService.revokePortfolioAccess(userId, portfolioId);
      }
    } catch (err) {
      console.error("Failed to update portfolio access:", err);
      setAccess(previous);
      showToast({
        title: "Failed to update portfolio access",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    try {
      await UserAdminService.deleteUser(deleteTarget.id);
      setUsers((rows) => rows.filter((u) => u.id !== deleteTarget.id));
      setAccess((rows) => rows.filter((a) => a.user_id !== deleteTarget.id));
      showToast({ title: "User deleted", type: "success" });
      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to delete user:", err);
      showToast({
        title: "Failed to delete user",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardBody>
            <p className="text-default-500">Only administrators can manage users.</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">User Management</h1>
      <div className="space-y-6 max-w-4xl">
        <Card>
          <CardHeader className="flex flex-col items-start gap-1 px-6 pt-6">
            <h2 className="text-xl font-semibold">Team Members</h2>
            <p className="text-sm text-default-500">
              Set roles and choose which portfolios each member can view. Admins always have access
              to every portfolio.
            </p>
          </CardHeader>
          <CardBody className="px-6 pb-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner label="Loading users..." />
              </div>
            ) : loadError ? (
              <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger">{loadError}</div>
            ) : (
              <Table aria-label="Team members" removeWrapper>
                <TableHeader>
                  <TableColumn>USER</TableColumn>
                  <TableColumn>ROLE</TableColumn>
                  <TableColumn>PORTFOLIO ACCESS</TableColumn>
                  <TableColumn aria-label="Actions" align="end">
                    {""}
                  </TableColumn>
                </TableHeader>
                <TableBody emptyContent="No users found.">
                  {users.map((u) => {
                    const isSelf = u.id === profile?.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="flex items-center gap-2 text-sm font-medium">
                              {u.full_name || "—"}
                              {isSelf && (
                                <Chip size="sm" variant="flat">
                                  You
                                </Chip>
                              )}
                            </span>
                            <span className="text-xs text-default-500">{u.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            aria-label={`Role for ${u.email}`}
                            selectedKeys={[u.role]}
                            onChange={(e) => {
                              const role = e.target.value as "admin" | "member";
                              if (role && role !== u.role) {
                                handleRoleChange(u.id, role);
                              }
                            }}
                            isDisabled={isSelf}
                            size="sm"
                            variant="bordered"
                            className="w-32"
                          >
                            <SelectItem key="member">Member</SelectItem>
                            <SelectItem key="admin">Admin</SelectItem>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-4">
                            {u.role === "admin" ? (
                              <span className="text-sm text-default-500">All portfolios</span>
                            ) : (
                              portfolios.map((p) => (
                                <Checkbox
                                  key={p.id}
                                  size="sm"
                                  isSelected={hasAccess(u.id, p.id)}
                                  onValueChange={(granted) =>
                                    handleAccessToggle(u.id, p.id, granted)
                                  }
                                >
                                  <span className="text-sm">{p.name}</span>
                                </Checkbox>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="danger"
                            aria-label={`Delete ${u.email}`}
                            isDisabled={isSelf}
                            onPress={() => setDeleteTarget(u)}
                          >
                            <Icon icon="solar:trash-bin-trash-linear" width={18} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <InviteUser onInvited={loadData} />
      </div>

      <Modal isOpen={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} size="md">
        <ModalContent>
          <ModalHeader>Delete user?</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              This permanently deletes{" "}
              <span className="font-medium">{deleteTarget?.full_name || deleteTarget?.email}</span>{" "}
              along with their portfolio access. This cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)} isDisabled={deleting}>
              Cancel
            </Button>
            <Button color="danger" onPress={handleDeleteUser} isLoading={deleting}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

export default Users;
