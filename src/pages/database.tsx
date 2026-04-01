import { useNavigate } from "react-router-dom";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { Icon } from "@iconify/react";

const DATABASE_TABLES = [
  { key: "user_profiles", name: "user_profiles", description: "User accounts and roles" },
  { key: "industries", name: "industries", description: "Industry classifications" },
  { key: "portfolios", name: "portfolios", description: "Investment portfolios" },
  { key: "funders", name: "funders", description: "Funder companies" },
  { key: "states", name: "states", description: "US states and territories" },
  { key: "merchants", name: "merchants", description: "Merchant businesses" },
  { key: "portfolio_funders", name: "portfolio_funders", description: "Portfolio-funder assignments" },
  { key: "deals", name: "deals", description: "Funding deals" },
];

export default function DatabasePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <Icon icon="solar:database-outline" width={24} />
        <h1 className="text-2xl font-bold">Database</h1>
      </div>
      <p className="text-default-500">Select a table to view and manage its data.</p>

      <Table
        aria-label="Database tables"
        selectionMode="single"
        onRowAction={(key) => navigate(`/database/${key}`)}
        classNames={{
          tr: "cursor-pointer hover:bg-default-100",
        }}
      >
        <TableHeader>
          <TableColumn>TABLE NAME</TableColumn>
          <TableColumn>DESCRIPTION</TableColumn>
        </TableHeader>
        <TableBody>
          {DATABASE_TABLES.map((table) => (
            <TableRow key={table.key}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Icon icon="solar:table-outline" width={18} className="text-default-400" />
                  <span className="font-mono">{table.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-default-500">{table.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
