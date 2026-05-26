// SuperAdmin — single-page app shell with sidebar nav + 5 tabs.
// Modern, responsive, shadcn-based. All data fetched via react-query.
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import closerControlLogo from "@/assets/closer-control-logo.png";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, SidebarInset,
  SidebarGroup, SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Users, Wallet, TrendingUp, Activity, LogOut, Plus, Search, RefreshCw,
  Play, KeyRound, Pencil, ExternalLink, Settings as SettingsIcon, Eye, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAdminCall, useAdminQuery, fmt$, fmt$4, type Customer, type AnyUser, type Tx, type SyncRun, type SyncStateRow } from "@/admin/api";
import { Kpi, StatusPill, RolePill, EmptyState, ErrorBox, PageHeader, balanceClass, TableSkeleton } from "@/admin/shared";
import { CustomerDetailSheet } from "@/admin/CustomerDetailSheet";
import { SyncRunDetailSheet } from "@/admin/SyncRunDetailSheet";
import { useToast } from "@/hooks/use-toast";

type Section = "customers" | "users" | "billing" | "costs" | "system";

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: "customers", label: "Customers", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "billing", label: "Billing", icon: Wallet },
  { id: "costs", label: "Cost tracking", icon: TrendingUp },
  { id: "system", label: "Sync & system", icon: Activity },
];

export default function SuperAdmin({ onImpersonate }: { onImpersonate?: (id: string) => void }) {
  const { who, signOut } = useAuth();
  const [section, setSection] = useState<Section>("customers");

  return (
    <div className="cc-admin">
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center gap-2 px-2 py-2">
              <img src={closerControlLogo} alt="" className="h-7 w-7" />
              <div className="group-data-[collapsible=icon]:hidden">
                <div className="font-display font-bold text-sm tracking-wider">CLOSER CONTROL</div>
                <div className="text-[9px] text-muted-foreground tracking-[0.18em]">SUPER ADMIN</div>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {SECTIONS.map(s => (
                    <SidebarMenuItem key={s.id}>
                      <SidebarMenuButton isActive={section === s.id} onClick={() => setSection(s.id)} tooltip={s.label}>
                        <s.icon className="h-4 w-4" />
                        <span>{s.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border">
            <div className="px-2 py-1 text-[10px] text-muted-foreground truncate group-data-[collapsible=icon]:hidden">{who?.user.email}</div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" /> <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="cc-admin-scroll bg-background">
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-4">
            <SidebarTrigger />
            <div className="font-display text-sm uppercase tracking-wider text-muted-foreground">
              {SECTIONS.find(s => s.id === section)?.label}
            </div>
          </header>
          <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
            {section === "customers" && <CustomersTab onImpersonate={onImpersonate} />}
            {section === "users" && <UsersTab />}
            {section === "billing" && <BillingTab />}
            {section === "costs" && <CostsTab />}
            {section === "system" && <SystemTab />}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

// ─── Customers tab ──────────────────────────────────────────────────────────
function CustomersTab({ onImpersonate }: { onImpersonate?: (id: string) => void }) {
  const { data, isLoading, error, refetch } = useAdminQuery<{ accounts: Customer[] }>(
    ["admin", "list-customers"], { action: "list-customers" }, { staleTime: 20_000 },
  );
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const customers = data?.accounts || [];
  const filtered = useMemo(() => customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.location_id.includes(search)
  ), [customers, search]);

  const totalBalance = customers.reduce((s, c) => s + c.balance_cents, 0);
  const totalReps = customers.reduce((s, c) => s + c.rep_count, 0);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="All organizations using Closer Control"
        right={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-9 w-56" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <Button onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5 mr-1" />New customer</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Kpi label="Customers" value={String(customers.length)} sub={`${customers.filter(c => c.is_active).length} active`} icon={<Building2 className="h-3 w-3" />} />
        <Kpi label="Reps total" value={String(totalReps)} icon={<Users className="h-3 w-3" />} />
        <Kpi label="Wallets balance" value={fmt$(totalBalance)} icon={<Wallet className="h-3 w-3" />} tone="green" />
        <Kpi label="Need top-up" value={String(customers.filter(c => c.balance_cents < 500).length)} sub="< $5 balance" tone={customers.some(c => c.balance_cents <= 0) ? "red" : "amber"} />
      </div>

      {error ? <ErrorBox>{(error as any).message}</ErrorBox> : null}

      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton cols={6} /> : filtered.length === 0 ? (
            <EmptyState>No customers yet. Click <b>New customer</b> to onboard one.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>GHL Location</TableHead>
                  <TableHead>Admins</TableHead>
                  <TableHead className="text-right">Reps</TableHead>
                  <TableHead className="text-right">Wallet</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id} className="hover:bg-accent/40 cursor-pointer" onClick={() => setPickedId(c.id)}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.id.slice(0, 8)}{!c.is_active && <span className="ml-1 text-destructive">· suspended</span>}</div>
                    </TableCell>
                    <TableCell><span className="font-mono text-xs text-muted-foreground">{c.location_id}</span></TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        {c.admins.slice(0, 2).map(a => <div key={a.id} className="text-muted-foreground">{a.email}</div>)}
                        {c.admins.length > 2 && <div className="text-[10px] text-muted-foreground">+{c.admins.length - 2} more</div>}
                        {c.admins.length === 0 && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{c.rep_count}</TableCell>
                    <TableCell className={`text-right font-bold ${balanceClass(c.balance_cents)}`}>{fmt$(c.balance_cents)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setPickedId(c.id); }}><Eye className="h-3.5 w-3.5" /></Button>
                      {onImpersonate && <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onImpersonate(c.id); }} title="Impersonate"><ExternalLink className="h-3.5 w-3.5" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CustomerDetailSheet customerId={pickedId} open={!!pickedId} onOpenChange={(v) => !v && (setPickedId(null), refetch())} onImpersonate={onImpersonate} />
      <CreateCustomerDialog open={showCreate} onOpenChange={setShowCreate} onCreated={refetch} />
    </>
  );
}

function CreateCustomerDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const call = useAdminCall();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", api_key: "", location_id: "", company_id: "", admin_email: "", admin_password: "", is_test: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await call({ action: "create-customer", ...form });
      toast({ title: form.is_test ? "Test customer created" : "Customer created" });
      setForm({ name: "", api_key: "", location_id: "", company_id: "", admin_email: "", admin_password: "", is_test: false });
      onCreated();
      onOpenChange(false);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cc-admin max-w-lg">
        <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
        {err && <ErrorBox>{err}</ErrorBox>}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1"><Label className="text-xs">Customer name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Acme Capital" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">GHL Company ID</Label><Input value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })} required /></div>
            <div className="space-y-1"><Label className="text-xs">GHL Location ID</Label><Input value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} required /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">GHL API Key</Label><Input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} required /></div>
          <div className="border-t border-border pt-3">
            <div className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground mb-2">First account admin</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={form.admin_email} onChange={e => setForm({ ...form, admin_email: e.target.value })} required /></div>
              <div className="space-y-1"><Label className="text-xs">Temp password</Label><Input type="password" minLength={6} value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })} required /></div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={form.is_test} onChange={e => setForm({ ...form, is_test: e.target.checked })} />
            Mark as <b className="text-foreground">Test Customer</b> (used for demos / seeded data)
          </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create customer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Users tab ──────────────────────────────────────────────────────────────
function UsersTab() {
  const { data, isLoading, error, refetch } = useAdminQuery<{ users: AnyUser[] }>(
    ["admin", "list-all-users"], { action: "list-all-users" }, { staleTime: 30_000 },
  );
  const call = useAdminCall();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const users = data?.users || [];
  const filtered = useMemo(() => users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.roles.some(r => r.account_name?.toLowerCase().includes(search.toLowerCase()))
  ), [users, search]);

  const reset = async (u: AnyUser) => {
    const p = prompt(`New password for ${u.email}:`);
    if (!p || p.length < 6) return;
    try { await call({ action: "reset-user-password", user_id: u.id, new_password: p }); toast({ title: "Password updated" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <>
      <PageHeader title="Users" subtitle="Every user across all customers" right={
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-9 w-56" placeholder="Search email or customer…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </>
      } />

      {error ? <ErrorBox>{(error as any).message}</ErrorBox> : null}

      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton cols={4} /> : filtered.length === 0 ? <EmptyState>No users.</EmptyState> : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Email</TableHead><TableHead>Roles & customers</TableHead><TableHead>Last sign-in</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.email}</div>
                      <div className="text-[10px] text-muted-foreground">{u.id.slice(0, 8)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {u.roles.map((r, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <RolePill role={r.role} />
                            {r.account_name && <span className="text-xs text-muted-foreground">{r.account_name}</span>}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => reset(u)} title="Reset password"><KeyRound className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Billing tab (system-wide) ─────────────────────────────────────────────
function BillingTab() {
  const customersQ = useAdminQuery<{ accounts: Customer[] }>(["admin", "list-customers"], { action: "list-customers" }, { staleTime: 20_000 });
  const [txSearch, setTxSearch] = useState("");
  const [txType, setTxType] = useState<string>("all");
  const [txDays, setTxDays] = useState<string>("30");
  const [txOffset, setTxOffset] = useState(0);
  const TX_LIMIT = 50;
  const txsQ = useAdminQuery<{ transactions: Tx[]; total: number }>(
    ["admin", "list-all-transactions", txSearch, txType, txDays, txOffset],
    { action: "list-all-transactions", limit: TX_LIMIT, offset: txOffset, search: txSearch, type_filter: txType, since_days: txDays === "all" ? undefined : Number(txDays) },
    { staleTime: 15_000 },
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pickedTx, setPickedTx] = useState<Tx | null>(null);
  const customers = customersQ.data?.accounts || [];
  const txs = txsQ.data?.transactions || [];
  const txTotal = txsQ.data?.total || 0;
  const totalBalance = customers.reduce((s, c) => s + c.balance_cents, 0);

  return (
    <>
      <PageHeader title="Billing" subtitle="Wallet balances and transactions across all customers" right={
        <Button variant="outline" size="icon" onClick={() => { customersQ.refetch(); txsQ.refetch(); }}><RefreshCw className="h-3.5 w-3.5" /></Button>
      } />

      <StripeModeCard />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Kpi label="Total balance" value={fmt$(totalBalance)} sub={`${customers.length} wallets`} tone="green" />
        <Kpi label="Empty wallets" value={String(customers.filter(c => c.balance_cents <= 0).length)} tone="red" />
        <Kpi label="Low balance" value={String(customers.filter(c => c.balance_cents > 0 && c.balance_cents < 500).length)} tone="amber" />
        <Kpi label="Transactions" value={String(txTotal)} sub="filtered" />
      </div>

      <Card className="border-border mb-5">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground"><Wallet className="h-3.5 w-3.5 inline mr-1.5" />Customer wallets</div>
          </div>
          {customersQ.isLoading ? <TableSkeleton cols={3} /> : customers.length === 0 ? <EmptyState>No customers.</EmptyState> : (
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {customers.map(c => (
                  <TableRow key={c.id}>
                    <TableCell><div className="font-medium">{c.name}</div><div className="text-[10px] text-muted-foreground">{c.location_id}</div></TableCell>
                    <TableCell className={`text-right font-bold ${balanceClass(c.balance_cents)}`}>{fmt$(c.balance_cents)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setPickedId(c.id)}>Open billing</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground"><Activity className="h-3.5 w-3.5 inline mr-1.5" />Transactions</div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-8 h-8 w-44 text-xs" placeholder="Search reason…" value={txSearch} onChange={e => { setTxSearch(e.target.value); setTxOffset(0); }} />
              </div>
              <Select value={txType} onValueChange={(v) => { setTxType(v); setTxOffset(0); }}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="cc-admin">
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                </SelectContent>
              </Select>
              <Select value={txDays} onValueChange={(v) => { setTxDays(v); setTxOffset(0); }}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="cc-admin">
                  <SelectItem value="1">24 hours</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {txsQ.isLoading ? <TableSkeleton cols={6} /> : txs.length === 0 ? <EmptyState>No transactions match.</EmptyState> : (
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
              <TableBody>
                {txs.map(t => {
                  const meta: any = (t as any).metadata || {};
                  const hasCall = !!(meta.call_id || meta.ghl_message_id);
                  return (
                    <TableRow
                      key={t.id}
                      className={hasCall ? "cursor-pointer hover:bg-accent/40" : ""}
                      onClick={() => hasCall && setPickedTx(t)}
                    >
                      <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{t.account_name}</TableCell>
                      <TableCell><span className={`text-[10px] uppercase tracking-wider font-bold ${t.type === "credit" ? "text-primary" : t.type === "debit" ? "text-destructive" : "text-amber-400"}`}>{t.type}</span></TableCell>
                      <TableCell className="text-xs">
                        {t.reason}
                        {meta.payment_method ? <span className="text-[10px] text-muted-foreground ml-1">· {meta.payment_method}</span> : null}
                        {hasCall ? <span className="text-[10px] text-primary ml-1">· details</span> : null}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${t.type === "debit" ? "text-destructive" : "text-primary"}`}>{t.type === "debit" ? "−" : "+"}{fmt$(Math.abs(t.amount_cents))}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{fmt$(t.balance_after_cents)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <Pager offset={txOffset} limit={TX_LIMIT} total={txTotal} onChange={setTxOffset} />
        </CardContent>
      </Card>

      <CustomerDetailSheet customerId={pickedId} open={!!pickedId} onOpenChange={(v) => !v && (setPickedId(null), customersQ.refetch(), txsQ.refetch())} />
      <TransactionDetailDialog tx={pickedTx} onClose={() => setPickedTx(null)} />
    </>
  );
}

// Transaction → call detail dialog
function TransactionDetailDialog({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const meta: any = (tx as any)?.metadata || {};
  const callId = meta.call_id as string | undefined;
  const ghlMsgId = meta.ghl_message_id as string | undefined;
  const detailQ = useAdminQuery<any>(
    ["admin", "get-call-detail", callId || ghlMsgId || "none"],
    { action: "get-call-detail", call_id: callId, ghl_message_id: ghlMsgId },
    { enabled: !!tx && !!(callId || ghlMsgId), staleTime: 60_000 },
  );
  const d = detailQ.data;
  return (
    <Dialog open={!!tx} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="cc-admin max-w-lg">
        <DialogHeader><DialogTitle className="text-sm">Transaction details</DialogTitle></DialogHeader>
        {!tx ? null : (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-muted-foreground">Reason</div><div>{tx.reason}</div></div>
              <div><div className="text-muted-foreground">Amount</div><div className={tx.type === "debit" ? "text-destructive" : "text-primary"}>{tx.type === "debit" ? "−" : "+"}{fmt$(Math.abs(tx.amount_cents))}</div></div>
              <div><div className="text-muted-foreground">When</div><div>{new Date(tx.created_at).toLocaleString()}</div></div>
              <div><div className="text-muted-foreground">Balance after</div><div>{fmt$(tx.balance_after_cents)}</div></div>
              {meta.markup ? <div><div className="text-muted-foreground">Markup</div><div>{meta.markup}×</div></div> : null}
              {meta.audio_seconds ? <div><div className="text-muted-foreground">Audio</div><div>{Math.round(meta.audio_seconds)}s</div></div> : null}
            </div>
            {(callId || ghlMsgId) && (
              <div className="border-t border-border pt-3">
                <div className="text-muted-foreground mb-2">Linked call</div>
                {detailQ.isLoading ? <div className="text-muted-foreground">Loading…</div> :
                 detailQ.error || !d ? <div className="text-destructive">Call not found.</div> : (
                  <div className="space-y-1">
                    <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{d.call?.ghl_message_id}</span></div>
                    {d.contact?.name && <div><span className="text-muted-foreground">Contact:</span> {d.contact.name}{d.contact.phone ? ` · ${d.contact.phone}` : ""}</div>}
                    {d.rep?.name && <div><span className="text-muted-foreground">Rep:</span> {d.rep.name}</div>}
                    <div><span className="text-muted-foreground">Direction:</span> {d.call?.direction} · <span className="text-muted-foreground">Duration:</span> {d.call?.call_duration ?? 0}s · <span className="text-muted-foreground">Status:</span> {d.call?.status}</div>
                    {d.call?.call_date && <div><span className="text-muted-foreground">Call time:</span> {new Date(d.call.call_date).toLocaleString()}</div>}
                    {d.score && <div><span className="text-muted-foreground">Score:</span> {d.score.overall_score} ({d.score.grade})</div>}
                    {d.usage_events?.length ? (
                      <div className="mt-2">
                        <div className="text-muted-foreground mb-1">All cost events for this call:</div>
                        {d.usage_events.map((e: any, i: number) => (
                          <div key={i} className="flex justify-between">
                            <span>{e.operation} ({e.model}) {e.audio_seconds ? `· ${e.audio_seconds}s` : ""}{e.tokens_in ? ` · ${e.tokens_in}/${e.tokens_out} tok` : ""}</span>
                            <span>{fmt$(e.billed_cents)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button size="sm" variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Reusable pager
function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (n: number) => void }) {
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
      <div>{start}–{end} of {total.toLocaleString()}</div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={!canPrev} onClick={() => onChange(Math.max(0, offset - limit))}>Prev</Button>
        <Button size="sm" variant="outline" disabled={!canNext} onClick={() => onChange(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}

// ─── Cost tracking tab ─────────────────────────────────────────────────────
function CostsTab() {
  const [days, setDays] = useState(30);
  const summaryQ = useAdminQuery<any>(["admin", "cost-summary", days], { action: "cost-summary", since_days: days }, { staleTime: 30_000 });
  const [opFilter, setOpFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [evOffset, setEvOffset] = useState(0);
  const EV_LIMIT = 50;
  const eventsQ = useAdminQuery<{ events: any[]; total: number }>(
    ["admin", "cost-events", opFilter, statusFilter, evOffset],
    { action: "cost-events", limit: EV_LIMIT, offset: evOffset, operation_filter: opFilter, status_filter: statusFilter },
    { staleTime: 15_000 },
  );

  const t = summaryQ.data?.totals || { events: 0, transcriptions: 0, scorings: 0, audio_seconds: 0, tokens_in: 0, tokens_out: 0, provider_cost_cents: 0, billed_cents: 0, margin_cents: 0 };
  const marginPct = t.billed_cents > 0 ? ((t.margin_cents / t.billed_cents) * 100).toFixed(1) : "0.0";

  return (
    <>
      <PageHeader title="Cost tracking" subtitle={`Provider spend vs customer billing · last ${days} days`} right={
        <>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent className="cc-admin">
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 365 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => { summaryQ.refetch(); eventsQ.refetch(); }}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </>
      } />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
        <Kpi label="Billed" value={fmt$(t.billed_cents)} sub={`${t.events} events`} />
        <Kpi label="Provider cost" value={fmt$(t.provider_cost_cents)} sub="OpenAI Whisper + GPT" tone="amber" />
        <Kpi label="Margin" value={fmt$(t.margin_cents)} sub={`${marginPct}%`} tone="green" />
        <Kpi label="Transcriptions" value={String(t.transcriptions)} sub={`${Math.round(t.audio_seconds / 60)} min`} />
        <Kpi label="Scorings" value={String(t.scorings)} sub={`${(t.tokens_in + t.tokens_out).toLocaleString()} tokens`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="border-border">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border font-bold text-xs uppercase tracking-wider text-muted-foreground">By provider</div>
            <Table>
              <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead className="text-right">Events</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
              <TableBody>
                {(summaryQ.data?.by_provider || []).length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState>No usage yet</EmptyState></TableCell></TableRow> :
                  summaryQ.data.by_provider.map((p: any) => (
                    <TableRow key={p.provider}>
                      <TableCell className="font-medium">{p.provider}</TableCell>
                      <TableCell className="text-right">{p.events}</TableCell>
                      <TableCell className="text-right text-amber-400">{fmt$(p.provider_cost_cents)}</TableCell>
                      <TableCell className="text-right">{fmt$(p.billed_cents)}</TableCell>
                      <TableCell className={`text-right font-bold ${p.margin_cents >= 0 ? "text-primary" : "text-destructive"}`}>{fmt$(p.margin_cents)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border font-bold text-xs uppercase tracking-wider text-muted-foreground">By customer</div>
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
              <TableBody>
                {(summaryQ.data?.by_account || []).length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState>No usage yet</EmptyState></TableCell></TableRow> :
                  summaryQ.data.by_account.map((a: any) => {
                    const m = a.billed_cents > 0 ? ((a.margin_cents / a.billed_cents) * 100).toFixed(0) : "—";
                    return (
                      <TableRow key={a.account_id}>
                        <TableCell><div className="font-medium">{a.account_name}</div><div className="text-[10px] text-muted-foreground">{a.transcriptions} trans · {a.scorings} scores</div></TableCell>
                        <TableCell className="text-right text-amber-400">{fmt$(a.provider_cost_cents)}</TableCell>
                        <TableCell className="text-right">{fmt$(a.billed_cents)}</TableCell>
                        <TableCell className={`text-right font-bold ${a.margin_cents >= 0 ? "text-primary" : "text-destructive"}`}>{fmt$(a.margin_cents)} <span className="text-[10px] text-muted-foreground">({m}%)</span></TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Usage events</div>
            <div className="flex flex-wrap gap-2">
              <Select value={opFilter} onValueChange={(v) => { setOpFilter(v); setEvOffset(0); }}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="cc-admin">
                  <SelectItem value="all">All operations</SelectItem>
                  <SelectItem value="transcription">Transcription</SelectItem>
                  <SelectItem value="scoring">Scoring</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setEvOffset(0); }}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="cc-admin">
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {eventsQ.isLoading ? <TableSkeleton cols={6} /> : (eventsQ.data?.events || []).length === 0 ? <EmptyState>No events</EmptyState> : (
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Customer</TableHead><TableHead>Operation</TableHead><TableHead>Provider</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
              <TableBody>
                {eventsQ.data!.events.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{e.account_name}</TableCell>
                    <TableCell className="text-xs uppercase tracking-wider text-muted-foreground">{e.operation}{e.status === "error" && <span className="ml-1 text-destructive">·err</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.provider}{e.model ? ` · ${e.model.split("/").pop()}` : ""}</TableCell>
                    <TableCell className="text-right text-amber-400 text-xs">{fmt$4(e.provider_cost_cents)}</TableCell>
                    <TableCell className="text-right text-xs">{fmt$(e.billed_cents)}</TableCell>
                    <TableCell className={`text-right text-xs ${Number(e.margin_cents) >= 0 ? "text-primary" : "text-destructive"}`}>{fmt$4(e.margin_cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pager offset={evOffset} limit={EV_LIMIT} total={eventsQ.data?.total || 0} onChange={setEvOffset} />
        </CardContent>
      </Card>
    </>
  );
}

// ─── System / Sync tab ─────────────────────────────────────────────────────
function SystemTab() {
  const customersQ = useAdminQuery<{ accounts: Customer[] }>(["admin", "list-customers"], { action: "list-customers" }, { staleTime: 30_000 });
  const [runStatus, setRunStatus] = useState<string>("all");
  const [runDays, setRunDays] = useState<string>("7");
  const [runOffset, setRunOffset] = useState(0);
  const RUN_LIMIT = 30;
  const runsQ = useAdminQuery<{ runs: SyncRun[]; states: SyncStateRow[]; total: number }>(
    ["admin", "list-sync-runs", runStatus, runDays, runOffset],
    { action: "list-sync-runs", limit: RUN_LIMIT, offset: runOffset, status_filter: runStatus, since_days: runDays === "all" ? undefined : Number(runDays) },
    { staleTime: 10_000, refetchInterval: 15_000 },
  );
  const call = useAdminCall();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [allBusy, setAllBusy] = useState(false);
  const [pickedRun, setPickedRun] = useState<SyncRun | null>(null);
  const [backfill, setBackfill] = useState<string>("incremental");

  const runs = runsQ.data?.runs || [];
  const states = runsQ.data?.states || [];
  const customers = customersQ.data?.accounts || [];
  const stateById = useMemo(() => new Map(states.map(s => [s.account_id, s])), [states]);
  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const trigger = async (id: string | null) => {
    if (id) setBusyId(id); else setAllBusy(true);
    const payload: Record<string, unknown> = { action: "trigger-sync", ...(id ? { account_id: id } : {}) };
    if (backfill !== "incremental") payload.backfill_seconds = backfill === "all" ? -1 : Number(backfill);
    try { await call(payload); toast({ title: id ? "Sync started" : "All syncs started" }); runsQ.refetch(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setBusyId(null); setAllBusy(false);
  };

  const successCount = runs.filter(r => r.status === "success").length;
  const errorCount = runs.filter(r => r.status === "error" || r.status === "failed").length;
  const callsLast50 = runs.reduce((s, r) => s + r.messages_saved, 0);

  return (
    <>
      <PageHeader title="Sync & system" subtitle="Background GHL sync · runs every 5 minutes · forward-only" right={
        <>
          <Select value={backfill} onValueChange={setBackfill}>
            <SelectTrigger className="h-9 text-xs w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="incremental">Since last sync</SelectItem>
              <SelectItem value="300">Last 5 minutes</SelectItem>
              <SelectItem value="600">Last 10 minutes</SelectItem>
              <SelectItem value="1800">Last 30 minutes</SelectItem>
              <SelectItem value="3600">Last 1 hour</SelectItem>
              <SelectItem value="86400">Last 24 hours</SelectItem>
              <SelectItem value="604800">Last 7 days</SelectItem>
              <SelectItem value="all">All since integration</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => runsQ.refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button onClick={() => trigger(null)} disabled={allBusy}><Play className="h-3.5 w-3.5 mr-1" />{allBusy ? "Running…" : "Run all now"}</Button>
        </>
      } />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Kpi label="Active customers" value={String(customers.filter(c => c.is_active).length)} />
        <Kpi label="Successful runs" value={String(successCount)} sub="last 50" tone="green" />
        <Kpi label="Failed runs" value={String(errorCount)} sub="last 50" tone={errorCount ? "red" : "default"} />
        <Kpi label="Call messages saved" value={String(callsLast50)} sub="last 50 runs" />
      </div>

      <AppSettingsCard />

      <Card className="border-border mb-5">
        <CardContent className="p-3 text-xs text-muted-foreground">
          <div className="font-bold text-foreground text-[11px] uppercase tracking-wider mb-1">What gets synced</div>
          For each active customer, the cron pulls GHL conversations newer than the last cursor (or the customer's integration date for first run).
          From each conversation it saves <span className="text-primary">call-type messages</span> (TYPE_CALL) into <code className="text-foreground">ghl_messages</code> — these are the raw call records used for transcription and scoring. The cursor is then advanced; history before the integration date is never backfilled. Click any run below to see exactly which messages were saved.
        </CardContent>
      </Card>

      <Card className="border-border mb-5">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-border font-bold text-xs uppercase tracking-wider text-muted-foreground">Per-customer sync state</div>
          {customers.length === 0 ? <EmptyState>No customers.</EmptyState> : (
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Cursor</TableHead><TableHead>Last run</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {customers.map(c => {
                  const s = stateById.get(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell><div className="font-medium flex items-center gap-2">{c.name}{!c.is_active && <span className="text-[9px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-0.5">Inactive</span>}</div><div className="text-[10px] text-muted-foreground">{c.location_id}</div></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s?.cursor_ms ? new Date(Number(s.cursor_ms)).toLocaleString() : "Never synced"}</TableCell>
                      <TableCell>{s?.last_run_at ? <div className="flex items-center gap-2 text-xs"><StatusPill status={s.last_status || "—"} /><span className="text-muted-foreground">{new Date(s.last_run_at).toLocaleString()}</span></div> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => trigger(c.id)} disabled={busyId === c.id || allBusy || !c.is_active} title={!c.is_active ? "Customer is inactive — re-activate to sync" : undefined}><Play className="h-3 w-3 mr-1" />{busyId === c.id ? "…" : "Run"}</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Sync runs (click for detail)</div>
            <div className="flex flex-wrap gap-2">
              <Select value={runStatus} onValueChange={(v) => { setRunStatus(v); setRunOffset(0); }}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="cc-admin">
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={runDays} onValueChange={(v) => { setRunDays(v); setRunOffset(0); }}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="cc-admin">
                  <SelectItem value="1">24 hours</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {runsQ.isLoading ? <TableSkeleton cols={6} /> : runs.length === 0 ? <EmptyState>No runs match. Click <b>Run all now</b>.</EmptyState> : (
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead>Trigger</TableHead><TableHead>Started</TableHead><TableHead className="text-right">Calls/Saved</TableHead><TableHead className="text-right">Duration</TableHead></TableRow></TableHeader>
              <TableBody>
                {runs.map(r => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setPickedRun(r)}>
                    <TableCell className="font-medium">{customerById.get(r.account_id)?.name || r.account_id.slice(0, 8)}</TableCell>
                    <TableCell><StatusPill status={r.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.trigger}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.started_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs">{r.call_messages_found}/{r.messages_saved}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pager offset={runOffset} limit={RUN_LIMIT} total={runsQ.data?.total || 0} onChange={setRunOffset} />
        </CardContent>
      </Card>

      <SyncRunDetailSheet run={pickedRun} open={!!pickedRun} onOpenChange={(v) => !v && setPickedRun(null)} />
    </>
  );
}

// ─── Global app settings card (super-admin pricing & thresholds) ───────────
function AppSettingsCard() {
  const settingsQ = useAdminQuery<{ settings: any }>(["admin", "app-settings"], { action: "get-app-settings" }, { staleTime: 60_000 });
  const call = useAdminCall();
  const { toast } = useToast();
  const s = settingsQ.data?.settings;
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // hydrate when data arrives
  useMemo(() => { if (s && !form) setForm(s); }, [s, form]);

  if (settingsQ.isLoading || !form) {
    return <Card className="border-border mb-5"><CardContent className="p-4 text-xs text-muted-foreground">Loading global settings…</CardContent></Card>;
  }

  const set = (k: string, v: number | string) => setForm({ ...form, [k]: v === "" ? "" : Number(v) });
  const save = async () => {
    setSaving(true);
    try {
      const payload: any = { action: "save-app-settings" };
      for (const k of ["default_markup_multiplier","default_min_call_seconds_for_ai","whisper_cents_per_minute","openai_input_cents_per_1k","openai_output_cents_per_1k"]) {
        if (typeof form[k] === "number" && !Number.isNaN(form[k])) payload[k] = form[k];
      }
      await call(payload);
      toast({ title: "Global settings saved" });
      settingsQ.refetch();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const Field = ({ k, label, step = "0.01", hint }: { k: string; label: string; step?: string; hint?: string }) => (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input type="number" step={step} value={form[k] ?? ""} onChange={e => set(k, e.target.value)} className="h-8 text-xs" />
      {hint && <div className="text-[9px] text-muted-foreground">{hint}</div>}
    </div>
  );

  const markup = Number(form.default_markup_multiplier ?? 2);

  return (
    <Card className="border-border mb-5">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-muted-foreground">
          <SettingsIcon className="h-3.5 w-3.5" /> Global pricing & thresholds (defaults for all customers)
        </div>

        {/* Markup slider — the X multiplier applied to provider cost */}
        <div className="space-y-2 border border-border rounded-md p-3 bg-card/40">
          <div className="flex items-end justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Default markup multiplier</Label>
            <div className="font-display text-2xl font-bold text-primary">{markup.toFixed(1)}×</div>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="0.1"
            value={markup}
            onChange={(e) => set("default_markup_multiplier", e.target.value)}
            className="w-full accent-primary cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>1× (cost only)</span><span>5×</span><span>10×</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            What we charge the customer = actual OpenAI cost × this multiplier. Example: a $0.03 call at {markup.toFixed(1)}× bills ${(0.03 * markup).toFixed(2)}.
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field k="default_min_call_seconds_for_ai" label="Min call seconds for AI" step="30" hint="Calls shorter than this are skipped — no Whisper, no scoring" />
          <Field k="whisper_cents_per_minute" label="Whisper ¢/min" hint="OpenAI Whisper actual rate" />
          <Field k="openai_input_cents_per_1k" label="GPT input ¢/1k tok" step="0.001" hint="Token-based, per OpenAI billing" />
          <Field k="openai_output_cents_per_1k" label="GPT output ¢/1k tok" step="0.001" />
        </div>
        <div className="text-[10px] text-muted-foreground">
          All AI costs are token/second based, not flat. Per-customer overrides (set in Customer → Billing) take precedence over these defaults.
        </div>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save global settings"}</Button>
      </CardContent>
    </Card>
  );
}

function StripeModeCard() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"test" | "live" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("stripe_mode").eq("id", true).maybeSingle()
      .then(({ data }) => setMode(data?.stripe_mode === "live" ? "live" : "test"));
  }, []);

  if (mode === null) return null;
  const isLive = mode === "live";

  const toggle = async () => {
    const next = isLive ? "test" : "live";
    if (next === "live" && !window.confirm("Switch Stripe to LIVE mode? Real cards will be charged.")) return;
    setSaving(true);
    const { error } = await supabase.from("app_settings").update({ stripe_mode: next, updated_at: new Date().toISOString() }).eq("id", true);
    setSaving(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    setMode(next);
    toast({ title: `Stripe mode: ${next.toUpperCase()}`, description: next === "live" ? "Real charges enabled." : "Test mode." });
  };

  return (
    <Card className={cn("border-2 mb-5", isLive ? "border-primary/50" : "border-amber-500/50")}>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn("h-9 w-9 rounded-md flex items-center justify-center border",
            isLive ? "bg-primary/15 border-primary/40" : "bg-amber-500/15 border-amber-500/40")}>
            <Zap className={cn("h-4 w-4", isLive ? "text-primary" : "text-amber-400")} />
          </div>
          <div>
            <div className="font-bold text-sm tracking-wide">
              Stripe mode: <span className={isLive ? "text-primary" : "text-amber-400"}>{mode.toUpperCase()}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isLive ? "Production keys — real money is moved." : "Test keys — no real charges."}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={toggle} disabled={saving}>
          {saving ? "…" : `Switch to ${isLive ? "Test" : "Live"}`}
        </Button>
      </CardContent>
    </Card>
  );
}

