import { useEffect, useState, useMemo, useRef } from "react";
import { formatTitleCase } from "../utils/textFormatter";
import { useChatSocket } from "../utils/useSocket";
  import { AlertTriangle, CheckCircle2, Clock, Copy, Check, Eye, EyeOff, Gift, IndianRupee, PackageCheck, Pencil, RefreshCw, Star, Trash2, Truck, Users, X, Paperclip, Clock3, Banknote, CreditCard, AlertCircle } from "lucide-react";
  import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
  import Layout from "../components/Layout";
  import { api, fileUrl } from "../api/client";
  import { Button, Card, DeliveryTimeline, Empty, FileUploadPreview, FormGrid, formatDate, formatMoney, Loading, PageHeader, PaymentBadge, Plus, Section, Select, SearchableSelect, StatusBadge, TextField } from "../components/UI";
  import { useAuth } from "../state/AuthContext";
  import { consumeProfileTargetTab, roleTabs } from "../utils/profileNavigation";
  import { useNavigate, useParams } from "react-router-dom";
  import { cachedGet } from "../utils/sessionApiCache";
  import AdminCeoAnalyticsDashboard from "../components/AdminCeoAnalyticsDashboard";
  import AdminCeoDealersOverview from "../components/AdminCeoDealersOverview";
  import AdminCeoProductsOverview from "../components/AdminCeoProductsOverview";
  import { AdminCeoDeliveryOverview, AdminCeoFinanceOverview, AdminCeoOrdersOverview, AdminCeoCreditOverview, MetricGrid } from "../components/AdminCeoOperationsOverviews";

  const INDIA_STATES_CITIES = {
    "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Rajahmundry", "Tirupati"],
    "Arunachal Pradesh": ["Itanagar", "Tawang", "Pasighat"],
    "Assam": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat"],
    "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Purnia"],
    "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg"],
    "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar"],
    "Haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Rohtak", "Hisar", "Karnal"],
    "Himachal Pradesh": ["Shimla", "Manali", "Dharamshala", "Solan", "Mandi"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar"],
    "Karnataka": ["Bengaluru", "Mysuru", "Hubli", "Mangaluru", "Belagavi", "Davanagere"],
    "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Kollam", "Thrissur"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain", "Sagar"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Aurangabad", "Solapur"],
    "Manipur": ["Imphal", "Thoubal"],
    "Meghalaya": ["Shillong", "Tura"],
    "Mizoram": ["Aizawl", "Lunglei"],
    "Nagaland": ["Kohima", "Dimapur"],
    "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur"],
    "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner", "Ajmer"],
    "Sikkim": ["Gangtok", "Namchi"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Ramagundam"],
    "Tripura": ["Agartala", "Udaipur"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Noida", "Agra", "Varanasi", "Meerut", "Prayagraj", "Ghaziabad"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani"],
    "West Bengal": ["Kolkata", "Howrah", "Darjeeling", "Asansol", "Siliguri", "Durgapur"],
    "Andaman and Nicobar Islands": ["Port Blair"],
    "Chandigarh": ["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Diu", "Silvassa"],
    "Delhi": ["New Delhi", "North Delhi", "South Delhi"],
    "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag"],
    "Ladakh": ["Leh", "Kargil"],
    "Lakshadweep": ["Kavaratti"],
    "Puducherry": ["Pondicherry", "Auroville", "Karaikal"]
  };
  const fullSku = (product, variant) => [product?.sku, variant?.skuSuffix].filter(Boolean).join("-") || product?.sku || "-";
  const productNameWithSku = (product, variant) => `${product?.productName || "Product"} (${fullSku(product, variant)})`;
  const rowNameWithSku = (row, nameKey = "productName", skuKey = "sku") => `${row?.[nameKey] || "Product"}${row?.[skuKey] ? ` (${row[skuKey]})` : ""}`;
  const orderItemLabel = (item) => {
    const variant = item.ProductVariant || item;
    const variantText = item.variantName ? ` - ${item.variantName}/${item.colorName || "-"}` : "";
    return `${productNameWithSku(item.Product, variant)}${variantText} x ${item.quantity}`;
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "dealers", label: "Dealers", icon: "dealers" },
    { id: "dealerPerformance", label: "Dealer Performance", icon: "performance" },
    { id: "products", label: "Products", icon: "products" },
    { id: "inventory", label: "Inventory", icon: "inventory" },
    { id: "orders", label: "Orders", icon: "orders" },
    { id: "delivery", label: "Delivery", icon: "delivery" },
    { id: "finance", label: "Finance", icon: "finance" },
    { id: "creditManagement", label: "Credit Management", icon: "credits" },
    { id: "dealerSales", label: "Dealer Sales", icon: "reports" },
    { id: "messages", label: "Messages", icon: "messages" },
    { id: "internalUpdates", label: "Notifications", icon: "internalUpdates" },
    { id: "policies", label: "Policies", icon: "policies" },
    { id: "reports", label: "Reports", icon: "reports" }
  ];

  export default function Admin() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { section } = useParams();
    const currentTabs = roleTabs[user?.role] || tabs;
    const profileTab = consumeProfileTargetTab("", currentTabs);
    const activeTab = currentTabs.some((tab) => tab.id === section) ? section : (profileTab || "dashboard");
    const setActiveTab = (tab) => navigate(`/admin/${tab}`);
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [dealerForm, setDealerForm] = useState({ dealerName: "", ownerName: "", email: "", password: "", confirmPassword: "", phone: "", state: "", city: "", pincode: "", address: "", allocatedLicenses: 1 });
    const [showDealerPassword, setShowDealerPassword] = useState(false);
    const [showDealerConfirmPassword, setShowDealerConfirmPassword] = useState(false);
    const [editingDealer, setEditingDealer] = useState(null);
    const [justCreatedDealer, setJustCreatedDealer] = useState(null);
    const [managingDealerManagers, setManagingDealerManagers] = useState(null);
    const [productForm, setProductForm] = useState({ productName: "", category: "", description: "", manufacturingDate: "", expiryDate: "", price: 0, quantity: 0, lowStockLimit: 10, creditCoins: 0, status: "active" });
    const [variantRows, setVariantRows] = useState([{ variantName: "Standard", colorName: "Default", stockQuantity: 0, priceOverride: "", skuSuffix: "", status: "active" }]);
    const [editingProduct, setEditingProduct] = useState(null);
    const [policyForm, setPolicyForm] = useState({ title: "", description: "", visibleToDealers: true });
    const [messageForm, setMessageForm] = useState({ title: "", message: "", dealerId: "" });
    const [paymentForm, setPaymentForm] = useState({ dealerId: "", orderId: "", amount: 0, paymentMethod: "UPI", paymentStatus: "pending", transactionId: "" });
    const [productImage, setProductImage] = useState(null);
    const [productPreview, setProductPreview] = useState("");
    const [schedules, setSchedules] = useState({});
    const [invoiceFiles, setInvoiceFiles] = useState({});
    const [internalFilter, setInternalFilter] = useState("all");
    const [financeFilter, setFinanceFilter] = useState("all");
    const [dealerError, setDealerError] = useState("");
    const [performanceFilter, setPerformanceFilter] = useState({ area: "", dealerId: "", startDate: "", endDate: "", productId: "", paymentStatus: "" });
    const [rewardForm, setRewardForm] = useState({ title: "", description: "", requiredCoins: 0, quantity: 0, category: "", terms: "", status: "active" });
    const [rewardImage, setRewardImage] = useState(null);
    const [rewardPreview, setRewardPreview] = useState("");
    const [orderFilter, setOrderFilter] = useState("all");
    const [orderPage, setOrderPage] = useState(1);
    const [deliveryFilter, setDeliveryFilter] = useState("all");
    const [deliveryPage, setDeliveryPage] = useState(1);
    const [chatTarget, setChatTarget] = useState(null);
    const [approvingOrderId, setApprovingOrderId] = useState(null);

    const load = async (force = false) => {
      setLoading(true);
      setLoadError("");
      const dashboardEndpoints = user?.role === "ADMIN_CEO"
        ? []
        : user?.role === "FINANCE_MANAGER"
        ? ["dashboard", "dashboard/analytics", "finance/payments", "finance/approved-orders"]
        : user?.role === "PRODUCT_DELIVERY_MANAGER"
        ? ["dashboard", "dashboard/analytics", "products", "orders", "stock/dealers"]
        : ["dashboard", "dashboard/analytics", "finance/payments"];

      const endpointByTab = {
        dashboard: dashboardEndpoints,
        licenseUpgrade: ["license-status"],
        dealers: ["dealers"],
        dealerPerformance: ["dealer-performance", "products"],
        products: ["products", "stock/dealers"],
        inventory: ["products", "stock/dealers"],
        orders: ["orders"],
        delivery: ["orders"],
        finance: ["finance/approved-orders", "finance/payments", "dealers"],
        creditManagement: ["credit/summary", "credit/rewards", "credit/redemptions", "credit/dealer-wallets"],
        dealerSales: ["dealer-sales", "dealers", "products"],
        messages: ["messages/conversations"],
        policies: ["policies"],
        reports: ["reports"]
      };
      const endpoints = endpointByTab[activeTab] || [];
      const result = await Promise.allSettled([
        ...endpoints.map((e) => cachedGet(api, `/admin/${e}`, {}, { force })),
        cachedGet(api, "/internal-updates", {}, { force })
      ]);
      const payload = {};
      endpoints.forEach((e, i) => {
        payload[e.replace("/", "_")] = result[i].status === "fulfilled" ? result[i].value.data : [];
      });
      payload.internalUpdates = result.at(-1).status === "fulfilled" ? result.at(-1).value.data : { rows: [], unreadCount: 0 };
      setData((current) => ({ ...current, ...payload }));
      const failedCount = result.filter((entry) => entry.status === "rejected").length;
      if (failedCount) {
        const forbiddenCount = result.filter((entry) => entry.status === "rejected" && entry.reason?.response?.status === 403).length;
        setLoadError(forbiddenCount
          ? "You do not have access to one or more dashboard sections. Authorized information is still shown below."
          : `${failedCount} dashboard ${failedCount === 1 ? "section" : "sections"} could not be loaded. Available information is still shown below.`);
      }
      setLoading(false);
    };

    useEffect(() => {
      if (!currentTabs.some((tab) => tab.id === section)) {
        navigate(`/admin/${activeTab}`, { replace: true });
        return;
      }
      load();
    }, [activeTab, user?.role]);

    const create = async (url, form, reset) => {
      if (form.pincode && !/^\d{6}$/.test(String(form.pincode))) {
        const message = "Pincode must be 6 digits";
        setDealerError(message);
        alert(message);
        return;
      }
      try {
        await api.post(url, form);
        setDealerError("");
        reset();
        alert("Saved successfully");
        load(true);
      } catch (error) {
        const message = error.response?.data?.message || "Unable to save. Please check the form.";
        setDealerError(message);
        if (error.response?.data?.code === "LICENSE_LIMIT_REACHED") setActiveTab("licenseUpgrade");
        alert(message);
      }
    };

    const createDealerAction = async (e) => {
      e.preventDefault();
      if (dealerForm.password !== dealerForm.confirmPassword) return alert("Passwords do not match");
      if (!dealerForm.pincode || !/^\d{6}$/.test(String(dealerForm.pincode).trim())) {
        const message = "Pincode must be exactly 6 digits";
        setDealerError(message);
        return alert(message);
      }
      if (dealerForm.phone && !/^\d{10}$/.test(String(dealerForm.phone).trim())) return alert("Phone must be exactly 10 digits");
      try {
        const res = await api.post("/admin/dealers", dealerForm);
        const created = res.data?.dealer || res.data;
        setJustCreatedDealer(created);
        setDealerError("");
        setDealerForm({ dealerName: "", ownerName: "", email: "", password: "", confirmPassword: "", phone: "", state: "", city: "", pincode: "", address: "", allocatedLicenses: 1 });
        load(true);
      } catch (error) {
        const message = error.response?.data?.message || "Unable to create dealer. Please check the form.";
        setDealerError(message);
        if (error.response?.data?.code === "LICENSE_LIMIT_REACHED") setActiveTab("licenseUpgrade");
        alert(message);
      }
    };

    const saveDealerEdit = async (dealerId, updates) => {
      await api.put(`/admin/dealers/${dealerId}`, updates);
      if (updates.allocatedLicenses) {
        await api.patch(`/admin/dealers/${dealerId}/licenses`, { allocatedLicenses: updates.allocatedLicenses });
      }
      load(true);
    };

    const updateOrder = async (id, status) => {
      const rejectionReason = status === "rejected" ? prompt("Reason for rejection") : "";
      await api.patch(`/admin/orders/${id}/status`, { status, rejectionReason, message: status.replaceAll("_", " ") });
      load(true);
    };

    const approveOrder = async (orderId) => {
      const schedule = schedules[orderId] || {};
      if (!schedule.packingDate || !schedule.shippingDate || !schedule.outForDeliveryDate || !schedule.deliveredDate) {
        alert("Select all delivery timeline dates before approval.");
        return;
      }
      try {
        setApprovingOrderId(orderId);
        await api.post(`/admin/orders/${orderId}/approve-with-schedule`, schedule);
        await load(true);
      } catch (err) {
        alert(err.response?.data?.message || "Failed to approve order.");
      } finally {
        setApprovingOrderId(null);
      }
    };

    const createProduct = async (e) => {
      e.preventDefault();
      const openingStock = Number(productForm.quantity || 0);
      const variantTotal = variantRows.reduce((sum, row) => sum + Number(row.stockQuantity || 0), 0);
      if (openingStock <= 0 && variantTotal <= 0) {
        return alert("Opening quantity / available company stock must be greater than 0");
      }
      const syncVariants = variantRows.map((r, i) => {
        if (i === 0 && Number(r.stockQuantity || 0) === 0 && openingStock > 0 && variantRows.length === 1) {
          return { ...r, stockQuantity: openingStock };
        }
        return r;
      });
      const formData = new FormData();
      Object.entries(productForm).forEach(([key, value]) => formData.append(key, value));
      formData.append("variants", JSON.stringify(syncVariants));
      if (productImage) formData.append("image", productImage);
      try {
        await api.post("/admin/products", formData, { headers: { "Content-Type": "multipart/form-data" } });
        setProductForm({ ...productForm, productName: "", description: "", manufacturingDate: "", expiryDate: "", quantity: 0 });
        setVariantRows([{ variantName: "Standard", colorName: "Default", stockQuantity: 0, priceOverride: "", skuSuffix: "", status: "active" }]);
        setProductImage(null);
        setProductPreview("");
        load(true);
      } catch (err) {
        alert(err.response?.data?.message || "Failed to add product");
      }
    };

    const loadDealerPerformance = async (next = performanceFilter) => {
      const res = await api.get("/admin/dealer-performance", { params: next });
      setData((current) => ({ ...current, "dealer-performance": res.data }));
    };

    const createReward = async (e) => {
      e.preventDefault();
      const formData = new FormData();
      Object.entries(rewardForm).forEach(([key, value]) => formData.append(key, value));
      if (rewardImage) formData.append("image", rewardImage);
      await api.post("/admin/credit/rewards", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setRewardForm({ title: "", description: "", requiredCoins: 0, quantity: 0, category: "", terms: "", status: "active" });
      setRewardImage(null);
      setRewardPreview("");
      load(true);
    };

    const updateRedemption = async (id, patch) => {
      await api.patch(`/admin/credit/redemptions/${id}/status`, patch);
      load(true);
    };

    const sendPaymentRequest = async (orderId) => {
      const formData = new FormData();
      if (invoiceFiles[orderId]) formData.append("invoice", invoiceFiles[orderId]);
      await api.post(`/admin/finance/send-payment-request/${orderId}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setInvoiceFiles({ ...invoiceFiles, [orderId]: null });
      load(true);
    };

    const sendPaymentReminder = async (paymentId) => {
      await api.post(`/admin/finance/reminder/${paymentId}`);
      alert("Payment reminder sent");
      load(true);
    };

    const confirmPayment = async (paymentId) => {
      try {
        await api.post(`/admin/finance/confirm-payment/${paymentId}`);
        alert("Payment confirmed successfully! Order has been moved to packing.");
        load(true);
      } catch (err) {
        alert(err.response?.data?.message || "Failed to confirm payment");
      }
    };

    const quickEditProduct = async (product) => {
      setEditingProduct(product);
    };

    const saveProductEdit = async (form) => {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (!["id", "variants", "imageFile"].includes(key)) formData.append(key, value ?? "");
      });
      formData.append("variants", JSON.stringify(form.variants || []));
      if (form.imageFile) formData.append("image", form.imageFile);
      await api.put(`/admin/products/${form.id}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setEditingProduct(null);
      load(true);
    };

    const deleteProduct = async (product) => {
      if (!confirm(`Delete or deactivate ${product.productName}?`)) return;
      await api.delete(`/admin/products/${product.id}`);
      load(true);
    };

    useChatSocket((payload) => {
      if (payload?.type === "chat_message" && payload?.data) {
        setData((curr) => {
          const conv = curr.messages_conversations || { dealers: [], messages: [] };
          const currentMsgs = conv.messages || [];
          if (currentMsgs.some((m) => m.id === payload.data.id)) return curr;
          return {
            ...curr,
            messages_conversations: {
              ...conv,
              messages: [...currentMsgs, payload.data]
            }
          };
        });
      }
    });

    const sendMessage = async (messageFormOverride) => {
      try {
        const { data: sentMsg } = await api.post("/admin/messages/send", messageFormOverride);
        setMessageForm((prev) => ({ ...prev, message: "" }));
        setData((curr) => {
          const conv = curr.messages_conversations || { dealers: [], messages: [] };
          const currentMsgs = conv.messages || [];
          if (currentMsgs.some((m) => m.id === sentMsg.id)) return curr;
          return {
            ...curr,
            messages_conversations: {
              ...conv,
              messages: [...currentMsgs, sentMsg]
            }
          };
        });
      } catch (err) {
        alert(err.response?.data?.message || "Failed to send message");
      }
    };

    const markUpdateRead = async (id) => {
      await api.patch(`/internal-updates/${id}/read`);
      load(true);
    };

    const markAllUpdatesRead = async () => {
      await api.patch("/internal-updates/read-all");
      load(true);
    };

    const clearReadUpdates = async () => {
      if (!confirm("Delete all read internal updates? This cannot be undone.")) return;
      await api.delete("/internal-updates/read-all");
      load(true);
    };

    if (loading) return <Layout title="Company Admin" subtitle="Company operations workspace" tabs={currentTabs} activeTab={activeTab} onTab={setActiveTab}><Loading /></Layout>;

    const dashboardCards = [
      ["Total Dealers", data.dashboard?.totalDealers], ["Products", data.dashboard?.totalProducts], ["Company Stock", data.dashboard?.totalCompanyStock],
      ["Low Stock", data.dashboard?.lowStockProducts], ["Pending Orders", data.dashboard?.pendingOrders], ["Delivered Orders", data.dashboard?.deliveredOrders],
      ["Pending Payments", data.dashboard?.pendingPayments], ["Revenue", formatMoney(data.dashboard?.totalRevenue)]
    ];

    return (
      <Layout title="Company Admin" subtitle={`${data.company?.companyName || "Company"} control center`} tabs={currentTabs} activeTab={activeTab} onTab={setActiveTab} unreadUpdates={data.internalUpdates?.unreadCount || 0}>
        <PageHeader
          eyebrow={String(user?.role || "Organization").replaceAll("_", " ")}
          title={currentTabs.find((tab) => tab.id === activeTab)?.label || "Dashboard"}
          description="Monitor organization operations, dealer performance, stock, orders, delivery and finance from one workspace."
          actions={<Button variant="ghost" onClick={() => load(true)} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</Button>}
        />
        {loadError && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 shadow-sm"><span>{loadError}</span><Button variant="ghost" onClick={load}>Retry</Button></div>}
        {activeTab === "dashboard" && (user?.role === "ADMIN_CEO" ? <AdminCeoReadOnlyOverview endpoint="/admin-ceo/dashboard" type="dashboard" /> : user?.role === "PRODUCT_DELIVERY_MANAGER" ? <ProductDeliveryManagerDashboard analytics={data.dashboard_analytics} products={data.products || []} orders={data.orders || []} dealerStock={data.stock_dealers || []} fallbackCards={dashboardCards} /> : user?.role === "FINANCE_MANAGER" ? <FinanceManagerDashboard analytics={data.dashboard_analytics} payments={data.finance_payments?.payments || []} stats={data.finance_payments?.stats || {}} fallbackCards={dashboardCards} /> : <AdminAnalytics analytics={data.dashboard_analytics} fallbackCards={dashboardCards} />)}
        {activeTab === "licenseUpgrade" && <LicenseCenter status={data["license-status"]} reload={() => load(true)} />}
        {activeTab === "adminManagers" && <AdminManagers />}
        {activeTab === "adminChat" && <AdminTeamChat chatTarget={chatTarget} />}
        {activeTab === "dealersOverview" && <AdminCeoReadOnlyOverview endpoint="/admin-ceo/dealers-overview" type="dealers" />}
        {activeTab === "productOverview" && <AdminCeoReadOnlyOverview endpoint="/admin-ceo/product-overview" type="products" />}
        {activeTab === "orderOverview" && <AdminCeoReadOnlyOverview endpoint="/admin-ceo/order-overview" type="orders" />}
        {activeTab === "deliveryOverview" && <AdminCeoReadOnlyOverview endpoint="/admin-ceo/delivery-overview" type="delivery" />}
        {activeTab === "financeOverview" && <AdminCeoReadOnlyOverview endpoint="/admin-ceo/finance-overview" type="finance" />}
        {activeTab === "creditOverview" && <AdminCeoReadOnlyOverview endpoint="/admin-ceo/credit-overview" type="credit" />}
        {activeTab === "transferApprovals" && <AdminCeoTransferApprovals />}
        {activeTab === "transferHistory" && <AdminCeoTransferHistory />}
        {activeTab === "interDealerRequests" && <InterDealerRequests />}
        {activeTab === "dealerPerformance" && <DealerPerformancePanel data={data["dealer-performance"]} filters={performanceFilter} setFilters={setPerformanceFilter} reload={loadDealerPerformance} products={data.products || []} />}
        {activeTab === "dealers" && (
          <>
            {justCreatedDealer && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white font-bold">✓</span>
                  <div>
                    <p className="font-bold text-slate-900">Dealer "{justCreatedDealer.dealerName}" created successfully!</p>
                    <p className="text-xs text-slate-600">Owner: {justCreatedDealer.ownerName} · Email: {justCreatedDealer.email} · Phone: {justCreatedDealer.phone || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setEditingDealer({ ...justCreatedDealer })}>
                    <Pencil size={14} /> Edit This Dealer
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setManagingDealerManagers({ ...justCreatedDealer })}>
                    <Users size={14} /> Add Dealer Manager
                  </Button>
                  <button type="button" onClick={() => setJustCreatedDealer(null)} className="rounded-md p-1.5 text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
            <Section title="Create dealer">
              {dealerError && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{dealerError}</div>}
              <FormGrid onSubmit={createDealerAction}>
                <TextField label="Dealer Name" value={dealerForm.dealerName} onChange={(e) => setDealerForm({ ...dealerForm, dealerName: e.target.value })} required />
                <TextField label="Owner Name" value={dealerForm.ownerName} onChange={(e) => setDealerForm({ ...dealerForm, ownerName: e.target.value })} required />
                <TextField label="Email" type="email" value={dealerForm.email} onChange={(e) => setDealerForm({ ...dealerForm, email: e.target.value })} required />
                <TextField label="Phone" type="tel" pattern="\d{10}" title="Phone must be exactly 10 digits" maxLength={10} minLength={10} value={dealerForm.phone} onChange={(e) => setDealerForm({ ...dealerForm, phone: e.target.value.replace(/\D/g, '') })} required />
                <TextField label="Password" type={showDealerPassword ? "text" : "password"} value={dealerForm.password} onChange={(e) => setDealerForm({ ...dealerForm, password: e.target.value })} required suffix={<button type="button" onClick={() => setShowDealerPassword(!showDealerPassword)} className="text-slate-400 hover:text-slate-600 focus:outline-none">{showDealerPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />
                <TextField label="Confirm Password" type={showDealerConfirmPassword ? "text" : "password"} value={dealerForm.confirmPassword} onChange={(e) => setDealerForm({ ...dealerForm, confirmPassword: e.target.value })} required suffix={<button type="button" onClick={() => setShowDealerConfirmPassword(!showDealerConfirmPassword)} className="text-slate-400 hover:text-slate-600 focus:outline-none">{showDealerConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />
                <TextField label="Licenses for dealer" type="number" min="1" step="1" value={dealerForm.allocatedLicenses} onChange={(e) => setDealerForm({ ...dealerForm, allocatedLicenses: e.target.value })} required />
                <SearchableSelect label="State" options={Object.keys(INDIA_STATES_CITIES)} value={dealerForm.state} onChange={(val) => setDealerForm({ ...dealerForm, state: val, city: "" })} placeholder="Select State..." required />
                <SearchableSelect label="City" options={INDIA_STATES_CITIES[dealerForm.state] || []} value={dealerForm.city} onChange={(val) => setDealerForm({ ...dealerForm, city: val })} placeholder="Select City..." required disabled={!dealerForm.state} />
                <TextField label="Pincode" inputMode="numeric" pattern="\d{6}" maxLength={6} minLength={6} title="Pincode must be exactly 6 digits" value={dealerForm.pincode} onChange={(e) => setDealerForm({ ...dealerForm, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} required />
                <div className="md:col-span-2">
                  <TextField label="Address" value={dealerForm.address} onChange={(e) => setDealerForm({ ...dealerForm, address: e.target.value })} required />
                </div>
                <div className="md:col-span-2"><Button type="submit"><Plus size={16} /> Create Dealer</Button></div>
              </FormGrid>
            </Section>
            <SimpleTable
              title="Dealer list"
              rows={data.dealers || []}
              cols={["dealerName", "ownerName", "email", "allocatedLicenses", "state", "city", "pincode", "status", "actions"]}
              renderCell={(row, column) => {
                if (column === "status") {
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const nextStatus = row.status === "active" ? "inactive" : "active";
                          await api.patch(`/admin/dealers/${row.id}/status`, { status: nextStatus });
                          load(true);
                        } catch (err) {
                          alert(err.response?.data?.message || "Failed to update status");
                        }
                      }}
                      className="cursor-pointer transition hover:opacity-80"
                      title="Click to toggle status"
                    >
                      <StatusBadge value={row.status} />
                    </button>
                  );
                }
                if (column === "actions") {
                  return (
                    <div className="flex items-center gap-2 min-w-max">
                      <button
                        type="button"
                        title="Edit dealer details"
                        onClick={() => setEditingDealer({ ...row })}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        title="View & add dealer managers"
                        onClick={() => setManagingDealerManagers({ ...row })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <Users size={13} /> Managers
                      </button>
                    </div>
                  );
                }
                return undefined;
              }}
            />
            {editingDealer && <EditDealerModal dealer={editingDealer} onClose={() => setEditingDealer(null)} onSave={saveDealerEdit} />}
            {managingDealerManagers && <DealerManagersModal dealer={managingDealerManagers} onClose={() => setManagingDealerManagers(null)} onRefresh={() => load(true)} />}
          </>
        )}
        {activeTab === "products" && (
          <>
            <Section title="Create product" actions={<span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">SKU auto-generates after save</span>}>
              <FormGrid onSubmit={createProduct}>
              {Object.keys(productForm).map((k) => <TextField key={k} label={k === "quantity" ? "Opening quantity" : k.replace(/([A-Z])/g, " $1")} value={productForm[k]} onChange={(e) => { const val = e.target.value; setProductForm({ ...productForm, [k]: val }); if (k === "quantity" && variantRows.length === 1) { setVariantRows([{ ...variantRows[0], stockQuantity: Number(val || 0) }]); } }} type={["price", "quantity", "lowStockLimit", "creditCoins"].includes(k) ? "number" : ["manufacturingDate", "expiryDate"].includes(k) ? "date" : "text"} min={k === "quantity" ? "1" : ["lowStockLimit", "creditCoins"].includes(k) ? "0" : undefined} required={k === "quantity" || k === "productName" || k === "price"} />)}
                <FileUploadPreview label="Product photo" preview={productPreview} accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; setProductImage(file || null); setProductPreview(file ? URL.createObjectURL(file) : ""); }} />
                <div className="md:col-span-2">
                  <VariantEditor rows={variantRows} setRows={setVariantRows} />
                </div>
                <div className="md:col-span-2"><Button type="submit"><Plus size={16} /> Add Product</Button></div>
              </FormGrid>
            </Section>
            <ProductTable rows={(data.products || []).map((p) => ({ ...p, quantity: p.CompanyInventory?.quantity || 0, lowStockLimit: p.CompanyInventory?.lowStockLimit || 0 }))} onEdit={quickEditProduct} onDelete={deleteProduct} />
            {editingProduct && <ProductEditModal product={editingProduct} onClose={() => setEditingProduct(null)} onSave={saveProductEdit} />}
            <SimpleTable
              title="Dealer-wise stock"
              rows={(data.stock_dealers || []).map((s) => ({
                dealer: s.Dealer?.dealerName || "Dealer",
                location: [s.Dealer?.area, s.Dealer?.city].filter(Boolean).join(", "),
                product: s.Product?.productName || "Product",
                sku: fullVariantSku(s.Product || { sku: "-" }, s.ProductVariant || s),
                variant: s.variantName || "-",
                color: s.colorName || "-",
                quantity: s.quantity,
                lowStockLimit: s.lowStockLimit
              }))}
              cols={["dealer", "location", "product", "sku", "variant", "color", "quantity", "lowStockLimit"]}
              renderCell={(row, column) => column === "sku" ? <CompactSku value={row.sku} /> : undefined}
            />
          </>
        )}
        {activeTab === "inventory" && <InventoryBoard products={(data.products || []).map((p) => ({ ...p, quantity: p.CompanyInventory?.quantity || 0, lowStockLimit: p.CompanyInventory?.lowStockLimit || 0 }))} dealerStock={data.stock_dealers || []} />}
        {activeTab === "orders" && <OrderTable rows={data.orders || []} updateOrder={updateOrder} approveOrder={approveOrder} approvingOrderId={approvingOrderId} schedules={schedules} setSchedules={setSchedules} filter={orderFilter} setFilter={setOrderFilter} page={orderPage} setPage={setOrderPage} />}
        {activeTab === "delivery" && <DeliveryManagement rows={(data.orders || []).filter((o) => ["packing", "shipping", "out_for_delivery", "delivered", "approved"].includes(o.status))} updateOrder={updateOrder} filter={deliveryFilter} setFilter={setDeliveryFilter} page={deliveryPage} setPage={setDeliveryPage} />}
        {activeTab === "finance" && (
          <>
            <MetricGrid items={[[Clock3, "Pending Payments", data.finance_payments?.stats?.pendingPayments || 0, "#F59E0B"], [CheckCircle2, "Paid Payments", data.finance_payments?.stats?.paidPayments || 0, "#10B981"], [Banknote, "Cash Payments", data.finance_payments?.stats?.cashPayments || 0, "#8B5CF6"], [CreditCard, "Online Payments", data.finance_payments?.stats?.onlinePayments || 0, "#4F46E5"], [AlertCircle, "Total Pending", formatMoney(data.finance_payments?.stats?.totalPendingAmount || 0), "#EF4444"], [IndianRupee, "Total Paid", formatMoney(data.finance_payments?.stats?.totalPaidAmount || 0), "#10B981"]]} cols="xl:grid-cols-3" />
            <Section title="Approved orders waiting for payment request">
              {data["finance_approved-orders"]?.length ? <div className="space-y-3">{data["finance_approved-orders"].map((o) => <div key={o.id} className="rounded-md border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{o.orderNumber} · {formatMoney(o.totalAmount)}</p><p className="text-sm text-slate-500">{o.Dealer?.dealerName} · approved {o.approvedAt ? new Date(o.approvedAt).toLocaleString() : ""}</p></div><div className="flex flex-wrap items-center gap-2"><input type="file" className="max-w-56 text-sm" onChange={(e) => setInvoiceFiles({ ...invoiceFiles, [o.id]: e.target.files?.[0] || null })} /><Button onClick={() => sendPaymentRequest(o.id)}>Send Payment Request</Button></div></div></div>)}</div> : <Empty text="No approved orders waiting for payment request" />}
            </Section>
            <FinanceTable rows={data.finance_payments?.payments || []} dealers={data.dealers || []} filter={financeFilter} setFilter={setFinanceFilter} sendReminder={sendPaymentReminder} confirmPayment={confirmPayment} />
          </>
        )}
        {activeTab === "creditManagement" && <CreditManagement data={data} form={rewardForm} setForm={setRewardForm} preview={rewardPreview} setPreview={setRewardPreview} setImage={setRewardImage} createReward={createReward} updateRedemption={updateRedemption} reload={() => load(true)} />}
        {activeTab === "dealerSales" && <AdminDealerSales data={data["dealer-sales"]} dealers={data.dealers || []} products={data.products || []} />}
        {activeTab === "policies" && <Composer title="Policy & information" form={policyForm} setForm={setPolicyForm} submit={() => create("/admin/policies", policyForm, () => setPolicyForm({ ...policyForm, title: "", description: "" }))} rows={data.policies} cols={["title", "description", "visibleToDealers"]} />}
        {activeTab === "messages" && <AdminChat data={data.messages_conversations} form={messageForm} setForm={setMessageForm} sendMessage={sendMessage} />}
        {activeTab === "internalUpdates" && <InternalUpdates data={data.internalUpdates} filter={internalFilter} setFilter={setInternalFilter} markRead={markUpdateRead} markAll={markAllUpdatesRead} clearRead={clearReadUpdates} openChat={(targetId) => { setChatTarget(targetId); setActiveTab("adminChat"); }} />}
        {activeTab === "reports" && <SimpleTable title="Dealer reports and updates" rows={data.reports} cols={["title", "type", "description", "dealerId", "createdAt"]} />}
      </Layout>
    );
  }

  function ProductDeliveryManagerDashboard({ analytics, products = [], orders = [], dealerStock = [], fallbackCards = [] }) {
    const [selectedProduct, setSelectedProduct] = useState(null);
    const summary = analytics?.summary || {};
    const normalizedProducts = products.map((p) => ({ ...p, quantity: Number(p.CompanyInventory?.quantity ?? p.quantity ?? 0), lowStockLimit: Number(p.CompanyInventory?.lowStockLimit ?? p.lowStockLimit ?? 0) }));
    const statusCounts = orders.reduce((acc, order) => ({ ...acc, [order.status || "pending"]: (acc[order.status || "pending"] || 0) + 1 }), {});
    const orderStatusData = Object.entries(statusCounts).map(([status, count]) => ({ status: status.replaceAll("_", " "), count }));
    const stockHealth = [
      { name: "Available", value: normalizedProducts.filter((p) => p.quantity > p.lowStockLimit).length },
      { name: "Low stock", value: normalizedProducts.filter((p) => p.quantity > 0 && p.quantity <= p.lowStockLimit).length },
      { name: "Out of stock", value: normalizedProducts.filter((p) => p.quantity <= 0).length }
    ];
    const stockArea = normalizedProducts.slice().sort((a, b) => b.quantity - a.quantity).slice(0, 10).map((p) => ({ ...p, product: p.productName, stock: p.quantity, lowLimit: p.lowStockLimit, sku: p.sku }));
    const dealerStockArea = Object.values(dealerStock.reduce((acc, row) => {
      const dealerName = row.Dealer?.dealerName || "Dealer";
      acc[dealerName] = acc[dealerName] || { dealerName, quantity: 0 };
      acc[dealerName].quantity += Number(row.quantity || 0);
      return acc;
    }, {})).slice(0, 10);
    const radarData = ["pending", "approved", "packing", "shipping", "out_for_delivery", "delivered", "rejected"].map((status) => ({ status: status.replaceAll("_", " "), orders: statusCounts[status] || 0 }));
    const cards = [
      ["Products", summary.totalProducts ?? normalizedProducts.length],
      ["Company Stock", summary.totalCompanyStock ?? normalizedProducts.reduce((sum, p) => sum + p.quantity, 0)],
      ["Low Stock", summary.lowStockProducts ?? stockHealth[1].value],
      ["Pending Orders", summary.pendingOrders ?? (statusCounts.pending || 0)],
      ["Approved Orders", summary.approvedOrders ?? (statusCounts.approved || 0)],
      ["Delivered Orders", summary.deliveredOrders ?? (statusCounts.delivered || 0)],
      ["Dealer Stock Rows", dealerStock.length],
      ["Delivery In Progress", ["packing", "shipping", "out_for_delivery"].reduce((sum, status) => sum + (statusCounts[status] || 0), 0)]
    ];
    const colors = ["#16A34A", "#F59E0B", "#64748B", "#4F46E5", "#0E7490", "#64748B"];
    const displayCards = cards.length ? cards : fallbackCards;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">{displayCards.map(([label, value]) => <ManagerKpiCard key={label} label={label} value={value ?? 0} />)}</div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Product stock health">
            <div className="h-80"><ResponsiveContainer><PieChart><Pie data={stockHealth} dataKey="value" nameKey="name" innerRadius={62} outerRadius={98} paddingAngle={4} stroke="white" strokeWidth={3} animationDuration={900}>{stockHealth.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" height={34} /></PieChart></ResponsiveContainer></div>
          </Section>
          <Section title="Order status radar">
            <div className="h-80"><ResponsiveContainer><RadarChart data={radarData}><PolarGrid /><PolarAngleAxis dataKey="status" /><PolarRadiusAxis allowDecimals={false} /><Radar name="Orders" dataKey="orders" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.35} /><Tooltip /><Legend /></RadarChart></ResponsiveContainer></div>
          </Section>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Company stock area graph">
            <div className="h-80"><ResponsiveContainer><AreaChart data={stockArea}><defs><linearGradient id="productStockFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0E7490" stopOpacity={0.28} /><stop offset="100%" stopColor="#0E7490" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#E8ECF4" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="product" tick={{ fill: "#64748B", fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: "#64748B", fontSize: 11 }} /><Tooltip formatter={(value, name, row) => [value, name === "stock" ? `Stock (${row.payload.sku || "-"})` : "Low limit"]} /><Legend /><Area type="monotone" dataKey="stock" stroke="#0E7490" strokeWidth={2.5} fill="url(#productStockFill)" animationDuration={1000} /><Area type="monotone" dataKey="lowLimit" stroke="#F59E0B" strokeDasharray="5 4" fill="none" animationDuration={1000} /></AreaChart></ResponsiveContainer></div>
          </Section>
          <Section title="Dealer inventory distribution">
            <div className="h-80"><ResponsiveContainer><AreaChart data={dealerStockArea}><defs><linearGradient id="dealerStockFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4F46E5" stopOpacity={0.24} /><stop offset="100%" stopColor="#4F46E5" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#E8ECF4" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="dealerName" tick={{ fill: "#64748B", fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: "#64748B", fontSize: 11 }} /><Tooltip /><Legend /><Area type="monotone" dataKey="quantity" stroke="#4F46E5" strokeWidth={2.5} fill="url(#dealerStockFill)" animationDuration={1000} /></AreaChart></ResponsiveContainer></div>
          </Section>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Top stock products">{stockArea.length ? <div className="space-y-2.5">{stockArea.slice(0, 5).map((product) => <div key={product.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 font-black text-indigo-700">{String(product.productName || "P").trim().charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900" title={product.productName}>{product.productName || "Product"}</p><p className="mt-0.5 text-xs text-slate-500">{Number(product.stock || 0).toLocaleString("en-IN")} units in company stock</p></div><Button variant="ghost" className="min-h-9 shrink-0 px-3 py-1.5 text-xs" onClick={() => setSelectedProduct(product)}>View details</Button></div>)}</div> : <Empty text="No stock products available" />}</Section>
          <MiniList title="Order status summary" rows={orderStatusData.map((row) => ({ status: row.status, count: row.count }))} left="status" right="count" />
        </div>
        {selectedProduct && <ProductDetailsModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
      </div>
    );
  }

  function FinanceManagerDashboard({ analytics, payments = [], stats = {}, fallbackCards = [] }) {
    const summary = analytics?.summary || {};
    const financeStats = analytics?.financeStats || {};

    const isCash = (m) => String(m || "").trim().toLowerCase() === "cash";
    const isOnline = (m) => ["online", "upi", "card", "bank_transfer", "net_banking"].includes(String(m || "").trim().toLowerCase());

    const realPendingCount = Number(stats.pendingPayments ?? financeStats.paymentStatusRatio?.find(r => r.status === 'pending')?.count ?? summary.pendingPayments ?? payments.filter((p) => String(p.paymentStatus).toLowerCase() === "pending").length ?? 0);
    const realPaidCount = Number(stats.paidPayments ?? financeStats.paymentStatusRatio?.find(r => r.status === 'paid')?.count ?? summary.paidPayments ?? payments.filter((p) => String(p.paymentStatus).toLowerCase() === "paid").length ?? 0);
    const realCashCount = Number(stats.cashPayments ?? payments.filter((p) => isCash(p.paymentMethod)).length ?? (financeStats.cashPaymentTotal > 0 ? 1 : 0));
    const realOnlineCount = Number(stats.onlinePayments ?? payments.filter((p) => isOnline(p.paymentMethod)).length ?? (financeStats.onlinePaymentTotal > 0 ? 1 : 0));
    const realTotalPending = Number(stats.totalPendingAmount ?? financeStats.pendingAmount ?? summary.totalPendingAmount ?? 0);
    const realTotalPaid = Number(stats.totalPaidAmount ?? financeStats.paidAmount ?? summary.totalRevenue ?? 0);

    const cards = [
      ["Pending Payments", realPendingCount],
      ["Paid Payments", realPaidCount],
      ["Cash Payments", realCashCount],
      ["Online Payments", realOnlineCount],
      ["Total Pending", formatMoney(realTotalPending)],
      ["Total Paid", formatMoney(realTotalPaid)]
    ];

    const statusCounts = payments.reduce((acc, payment) => {
      const s = String(payment.paymentStatus || "pending").toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    if (Object.keys(statusCounts).length === 0) {
      if (realPaidCount > 0) statusCounts.paid = realPaidCount;
      if (realPendingCount > 0) statusCounts.pending = realPendingCount;
    }
    const statusData = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
    const totalPaymentsCount = statusData.reduce((sum, row) => sum + Number(row.count || 0), 0);

    const cashOnline = [
      { name: "Cash", value: realCashCount, fill: "#0E7490" },
      { name: "Online", value: realOnlineCount, fill: "#4F46E5" },
      { name: "Pending", value: realPendingCount, fill: "#F59E0B" }
    ];
    const totalMethodCount = cashOnline.reduce((sum, item) => sum + Number(item.value || 0), 0);

    let dealerOutstanding = Object.values(payments.filter((payment) => String(payment.paymentStatus).toLowerCase() === "pending").reduce((acc, payment) => {
      const dealer = payment.Dealer?.dealerName || "Dealer";
      acc[dealer] = acc[dealer] || { dealer, amount: 0, invoices: 0 };
      acc[dealer].amount += Number(payment.amount || 0);
      acc[dealer].invoices += 1;
      return acc;
    }, {})).sort((a, b) => b.amount - a.amount).slice(0, 10);

    if (!dealerOutstanding.length && financeStats.dealerWiseOutstandingPayment?.length) {
      dealerOutstanding = financeStats.dealerWiseOutstandingPayment.map((d) => ({
        dealer: d.dealerName,
        amount: Number(d.amount || 0),
        invoices: 1
      })).filter((d) => d.amount > 0);
    }

    const monthlyArea = payments.reduce((acc, payment) => {
      const key = payment.createdAt ? new Date(payment.createdAt).toISOString().slice(0, 10) : "Recent";
      acc[key] = acc[key] || { date: key, paid: 0, pending: 0 };
      if (String(payment.paymentStatus).toLowerCase() === "paid") {
        acc[key].paid += Number(payment.amount || 0);
      } else {
        acc[key].pending += Number(payment.amount || 0);
      }
      return acc;
    }, {});
    const areaData = Object.values(monthlyArea).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
          {(cards.length ? cards : fallbackCards).map(([label, value]) => (
            <ManagerKpiCard key={label} label={label} value={value ?? 0} />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Payment status overview">
            {totalPaymentsCount > 0 ? (
              <div className="relative h-80">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={statusData} dataKey="count" nameKey="status" innerRadius={72} outerRadius={108} paddingAngle={4} stroke="white" strokeWidth={3} animationDuration={900}>
                      {statusData.map((row, index) => (
                        <Cell key={row.status} fill={row.status === "paid" ? "#16A34A" : row.status === "pending" ? "#F59E0B" : ["#64748B", "#4F46E5"][index % 2]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={34} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 bottom-8 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-slate-900">{totalPaymentsCount.toLocaleString("en-IN")}</span>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Payments</span>
                </div>
              </div>
            ) : (
              <Empty text="No payment status records recorded yet" />
            )}
          </Section>
          <Section title="Payment method distribution">
            {totalMethodCount > 0 ? (
              <div className="h-80">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={cashOnline.filter((i) => i.value > 0)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={98} paddingAngle={4} stroke="white" strokeWidth={3} animationDuration={900}>
                      {cashOnline.filter((i) => i.value > 0).map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={34} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty text="No payment method data recorded yet" />
            )}
          </Section>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Paid vs pending amount area graph">
            {areaData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer>
                  <AreaChart data={areaData}>
                    <defs>
                      <linearGradient id="paidFinanceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16A34A" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#16A34A" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="pendingFinanceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatMoney(value)} />
                    <Legend />
                    <Area type="monotone" dataKey="paid" stroke="#16A34A" fill="url(#paidFinanceFill)" />
                    <Area type="monotone" dataKey="pending" stroke="#F59E0B" fill="url(#pendingFinanceFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty text="No transaction history recorded yet" />
            )}
          </Section>
          <Section title="Dealer-wise outstanding amount">
            {dealerOutstanding.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={dealerOutstanding} layout="vertical" margin={{ left: 8, right: 22, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(value) => `₹${Number(value || 0).toLocaleString("en-IN")}`} />
                    <YAxis type="category" dataKey="dealer" width={105} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => formatMoney(value)} />
                    <Bar dataKey="amount" fill="#0E7490" radius={[0, 7, 7, 0]} maxBarSize={28} animationDuration={900} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-80 text-center p-6">
                <CheckCircle2 size={40} className="text-emerald-500 mb-2" />
                <p className="font-bold text-slate-800 text-sm">All Dealer Balances Cleared</p>
                <p className="text-xs text-slate-500 mt-1">There are no outstanding pending payments across dealers.</p>
              </div>
            )}
          </Section>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <MiniList title="Outstanding dealers" rows={dealerOutstanding} left="dealer" right="amount" prefix="Rs " />
          <Recent title="Recent messages" rows={analytics?.recentMessages || []} primary={(row) => row.sender?.name || row.title || "Message"} secondary={(row) => `${row.sender?.role ? `${row.sender.role.replaceAll("_", " ")} - ` : ""}${row.message || row.title || ""}`} />
        </div>
      </div>
    );
  }

  function ManagerKpiCard({ label, value, icon: Icon }) {
    const text = String(label || "").toLowerCase();
    const tone = /pending|low stock|approved|delivered|payment/.test(text) ? "border-amber-500" : /revenue|sales|paid/.test(text) ? "border-green-600" : "border-indigo-600";
    const Glyph = Icon || (/dealer/.test(text) ? Users : /payment|amount|revenue/.test(text) ? IndianRupee : /order/.test(text) ? Clock : /stock|product/.test(text) ? PackageCheck : CheckCircle2);
    const iconTone = tone === "border-amber-500" ? "bg-amber-50 text-amber-700" : tone === "border-green-600" ? "bg-green-50 text-green-700" : "bg-indigo-50 text-indigo-700";
    return <div className={`group min-w-0 rounded-[18px] border border-slate-200 border-t-[3px] ${tone} bg-white p-[18px] shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg`}><span className={`mb-4 grid h-10 w-10 place-items-center rounded-xl ${iconTone}`}><Glyph size={19} /></span><p className="truncate text-sm font-semibold text-slate-500" title={String(label)}>{label}</p><p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-2xl font-black tracking-tight text-slate-950" title={String(value ?? 0)}>{typeof value === "number" ? value.toLocaleString("en-IN") : value ?? 0}</p></div>;
  }

  function AdminProductStockList({ title, rows = [], low = false }) {
    const max = Math.max(1, ...rows.map((row) => Number(row.quantity || 0)));
    return <Section title={title}>{rows.length ? <div className="space-y-2.5">{rows.map((row, index) => { const stock = Number(row.quantity || 0); const limit = Number(row.lowStockLimit || max); const progress = Math.max(4, Math.min(100, (stock / (low ? Math.max(limit, 1) : max)) * 100)); return <div key={`${row.productName}-${row.sku || index}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-indigo-100 hover:bg-white"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black ${low ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"}`}>{String(row.productName || "P").trim().charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900" title={row.productName}>{row.productName || "Product"}</p><p className="truncate font-mono text-[11px] text-slate-500" title={row.sku || "SKU not assigned"}>SKU · {row.sku || "Not assigned"}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-[width] duration-700 ${low ? "bg-amber-500" : "bg-indigo-600"}`} style={{ width: `${progress}%` }} /></div></div><div className="shrink-0 text-right"><p className="text-lg font-black text-slate-950">{stock.toLocaleString("en-IN")}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">units</p></div></div>; })}</div> : <Empty text={low ? "All products are well stocked" : "No stock records available"} />}</Section>;
  }

  function AdminAnalytics({ analytics, fallbackCards }) {
    if (!analytics) return <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">{fallbackCards.map(([label, value]) => <ManagerKpiCard key={label} label={label} value={value} />)}</div>;
    const paymentStatus = analytics.financeStats?.paymentStatusRatio || [];
    const paymentTotal = paymentStatus.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const paidPercent = paymentTotal ? Math.round((Number(paymentStatus.find((row) => row.status === "paid")?.count || 0) / paymentTotal) * 100) : 0;
    const summaryCards = [
      ["Total Dealers", analytics.summary.totalDealers, Users],
      ["Total Products", analytics.summary.totalProducts, PackageCheck],
      ["Total Company Stock", analytics.summary.totalCompanyStock, PackageCheck],
      ["Low Stock Products", analytics.summary.lowStockProducts, AlertTriangle],
      ["Pending Orders", analytics.summary.pendingOrders, Clock],
      ["Approved Orders", analytics.summary.approvedOrders, CheckCircle2],
      ["Delivered Orders", analytics.summary.deliveredOrders, Truck],
      ["Pending Payments", analytics.summary.pendingPayments, IndianRupee],
      ["Total Revenue", formatMoney(analytics.summary.totalRevenue), IndianRupee],
      ["Total Pending Amount", formatMoney(analytics.summary.totalPendingAmount), IndianRupee],
      ["Today Dealer Sales", analytics.salesStats?.todayCompanyDealerSales || 0, PackageCheck],
      ["Monthly Dealer Sales", analytics.salesStats?.monthlyDealerSales || 0, PackageCheck]
    ];
    const maxOrders = Math.max(...analytics.orderStatusCounts.map((row) => row.count), 1);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">{summaryCards.map(([label, value, Icon]) => <ManagerKpiCard key={label} label={label} value={value ?? 0} icon={Icon} />)}</div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Section title="Order analytics">{analytics.orderStatusCounts.map((row) => <div key={row.status} className="mb-3"><div className="mb-1 flex justify-between text-sm"><span className="capitalize">{row.status.replaceAll("_", " ")}</span><span>{row.count}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand" style={{ width: `${(row.count / maxOrders) * 100}%` }} /></div></div>)}</Section>
          <Section title="Payment status ratio"><div className="relative h-72"><ResponsiveContainer><PieChart><Pie data={paymentStatus} dataKey="count" nameKey="status" innerRadius={58} outerRadius={92} paddingAngle={4} stroke="white" strokeWidth={3} animationDuration={900}>{paymentStatus.map((entry) => <Cell key={entry.status} fill={entry.status === "paid" ? "#16A34A" : entry.status === "pending" ? "#F59E0B" : "#64748B"} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" height={28} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 bottom-7 flex flex-col items-center justify-center"><span className="text-2xl font-black text-slate-900">{paidPercent}%</span><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Paid</span></div></div></Section>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <AdminProductStockList title="Top 5 highest stock products" rows={analytics.inventoryStats.topHighestStockProducts || []} />
          <AdminProductStockList title="Top 5 low stock products" rows={analytics.inventoryStats.topLowStockProducts || []} low />
          <MiniList title="Dealer-wise outstanding payment" rows={analytics.financeStats.dealerWiseOutstandingPayment} left="dealerName" right="amount" prefix="Rs " />
          <MiniList title="Area-wise dealer count" rows={analytics.dealerStats.areaWiseDealerCount} left="area" right="count" />
          <MiniList title="Top selling products" rows={(analytics.salesStats?.topSellingProducts || []).map((row) => ({ ...row, productName: rowNameWithSku(row) }))} left="productName" right="quantitySold" />
          <MiniList title="Dealer sales performance" rows={analytics.salesStats?.dealerSalesPerformance || []} left="dealerName" right="quantitySold" />
        </div>
        <Section title="Dealer stock summary"><div className="h-72"><ResponsiveContainer><BarChart data={analytics.inventoryStats.dealerWiseStockSummary} margin={{ top: 16, right: 16, left: 0, bottom: 36 }}><CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" vertical={false} /><XAxis dataKey="dealerName" angle={-18} textAnchor="end" height={48} tick={{ fill: "#64748B", fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: "#64748B", fontSize: 11 }} /><Tooltip /><Bar dataKey="quantity" name="Stock units" fill="#0E7490" radius={[7, 7, 0, 0]} maxBarSize={42} animationDuration={900} /></BarChart></ResponsiveContainer></div></Section>
        <div className="grid gap-6 xl:grid-cols-2">
          <Recent title="Recent orders" rows={analytics.recentOrders} primary={(row) => row.orderNumber} secondary={(row) => `${row.status} | ${formatMoney(row.totalAmount)}`} />
          <Recent title="Recent payments" rows={analytics.recentPayments} primary={(row) => row.Dealer?.dealerName || row.invoiceNumber || "Payment"} secondary={(row) => `${row.Order?.items?.map(orderItemLabel).join(", ") || row.productSummary || row.paymentStatus} | ${formatMoney(row.amount)}`} />
          <Recent title="Recent messages" rows={analytics.recentMessages} primary={(row) => row.sender?.name || row.title || "Message"} secondary={(row) => `${row.sender?.role ? `${row.sender.role.replaceAll("_", " ")} - ` : ""}${row.message || row.title || ""}`} />
          <Recent title="Recent delivery updates" rows={analytics.recentDeliveryUpdates} primary={(row) => row.status} secondary={(row) => row.message} />
        </div>
      </div>
    );
  }

  function InterDealerRequests() {
    const [payload, setPayload] = useState({ rows: [], analytics: {} });
    const [loading, setLoading] = useState(true);
    const load = async () => {
      setLoading(true);
      try { const { data } = await api.get("/admin/stock-transfer-requests"); setPayload(data); }
      finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);
    const approve = async (row) => {
      await api.patch(`/admin/stock-transfer-requests/${row.id}/manager-approve`);
      load();
    };
    const reject = async (row) => {
      const reason = prompt("Reason for rejection") || "";
      if (!reason.trim()) return;
      await api.patch(`/admin/stock-transfer-requests/${row.id}/manager-reject`, { reason });
      load();
    };
    if (loading) return <Loading />;
    const cards = [
      ["Pending inter-dealer requests", payload.analytics.REQUESTED || 0],
      ["Completed transfers", payload.analytics.TRANSFER_COMPLETED || 0],
      ["Rejected requests", (payload.analytics.MANAGER_REJECTED || 0) + (payload.analytics.ADMIN_REJECTED || 0)]
    ];
    return <div className="space-y-6"><div className="flex justify-end"><Button variant="ghost" onClick={load}><RefreshCw size={15} /> Refresh</Button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value]) => <Card key={label} label={label} value={value} />)}</div><TransferRequestTable rows={payload.rows || []} mode="manager" onApprove={approve} onReject={reject} /></div>;
  }

  function AdminCeoTransferApprovals() {
    const [payload, setPayload] = useState({ approvals: [], analytics: {} });
    const [loading, setLoading] = useState(true);
    const load = async () => {
      setLoading(true);
      const { data } = await api.get("/admin-ceo/stock-transfer-requests");
      setPayload(data);
      setLoading(false);
    };
    useEffect(() => { load(); }, []);
    const approve = async (row) => {
      if (!confirm(`Final approve transfer of ${row.requestedQuantity} ${row.productNameSnapshot}?`)) return;
      await api.patch(`/admin-ceo/stock-transfer-requests/${row.id}/final-approve`);
      load();
    };
    const reject = async (row) => {
      const reason = prompt("Reason for final rejection") || "";
      if (!reason.trim()) return;
      await api.patch(`/admin-ceo/stock-transfer-requests/${row.id}/final-reject`, { reason });
      load();
    };
    if (loading) return <Loading />;
    return <div className="space-y-6"><TransferAnalytics analytics={payload.analytics} /><TransferRequestTable rows={payload.approvals || []} mode="admin" onApprove={approve} onReject={reject} /></div>;
  }

  function AdminCeoTransferHistory() {
    const [payload, setPayload] = useState({ rows: [], analytics: {} });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("ALL");
    useEffect(() => {
      setLoading(true);
      api.get("/admin-ceo/stock-transfer-requests").then((res) => setPayload(res.data)).finally(() => setLoading(false));
    }, []);
    if (loading) return <Loading />;
    const rows = (payload.rows || []).filter((row) => filter === "ALL" || row.status === filter);
    return <div className="space-y-6"><TransferAnalytics analytics={payload.analytics} /><Section title="Transfer history" actions={<select className="rounded-md border border-slate-200 px-3 py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>{["ALL", "REQUESTED", "MANAGER_APPROVED", "TRANSFER_COMPLETED", "MANAGER_REJECTED", "ADMIN_REJECTED", "CANCELLED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>}><TransferRequestTable rows={rows} mode="readonly" /></Section></div>;
  }

  function TransferAnalytics({ analytics = {} }) {
    const cards = [
      ["Total transfer requests", analytics.totalTransferRequests || 0],
      ["Pending approvals", analytics.pendingApprovals || 0],
      ["Completed transfers", analytics.completedTransfers || 0],
      ["Rejected requests", analytics.rejectedRequests || 0],
      ["Top product requested", analytics.topProductRequested?.label || "-"],
      ["Top sender dealer", analytics.topDealerSender?.label || "-"],
      ["Top requester dealer", analytics.topDealerRequester?.label || "-"]
    ];
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <Card key={label} label={label} value={value} />)}</div>;
  }

  function TransferRequestTable({ rows = [], mode, onApprove, onReject }) {
    if (!rows.length) return <Section title="Inter-dealer transfer requests"><Empty text="No inter-dealer transfer requests found" /></Section>;
    return <Section title="Inter-dealer transfer requests"><div className="overflow-x-auto rounded-md border border-slate-200"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr>{["Requester", "Sender", "Product", "Quantity", "Current Sender Stock", "Reason", "Status", "Approval Timeline", "Action"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="align-top"><td className="px-4 py-3"><DealerCell dealer={row.requesterDealer} /></td><td className="px-4 py-3"><DealerCell dealer={row.senderDealer} /></td><td className="px-4 py-3"><p className="font-semibold text-slate-950">{row.productNameSnapshot}</p><p className="text-xs text-slate-500">{row.sku} {row.variantNameSnapshot ? `| ${row.variantNameSnapshot} / ${row.colorNameSnapshot || "-"}` : ""}</p></td><td className="px-4 py-3 text-lg font-semibold text-slate-950">{row.requestedQuantity}</td><td className="px-4 py-3">{row.availableQuantityAtRequest} at request</td><td className="px-4 py-3 max-w-56 text-slate-600">{row.reason || "-"}</td><td className="px-4 py-3"><StatusBadge value={row.status} /></td><td className="px-4 py-3"><ApprovalTimeline row={row} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{mode !== "readonly" && ((mode === "manager" && row.status === "REQUESTED") || (mode === "admin" && row.status === "MANAGER_APPROVED")) ? <><Button className="min-h-9 px-3 py-1.5 text-xs" onClick={() => onApprove(row)}>Approve</Button><Button variant="danger" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => onReject(row)}>Reject</Button></> : <span className="text-xs font-semibold text-slate-400">No action</span>}</div></td></tr>)}</tbody></table></div></Section>;
  }

  function DealerCell({ dealer }) {
    return <div><p className="font-semibold text-slate-950">{dealer?.dealerName || "-"}</p><p className="text-xs text-slate-500">{[dealer?.area, dealer?.city, dealer?.pincode].filter(Boolean).join(", ") || dealer?.address || "-"}</p></div>;
  }

  function ApprovalTimeline({ row }) {
    const steps = [
      ["Request Created", row.createdAt, true],
      ["Manager Approval", row.managerApprovedAt, ["MANAGER_APPROVED", "TRANSFER_COMPLETED"].includes(row.status)],
      ["Admin CEO Final Approval", row.adminApprovedAt, row.status === "TRANSFER_COMPLETED"],
      ["Transfer Completed", row.completedAt, row.status === "TRANSFER_COMPLETED"]
    ];
    return <div className="space-y-1">{steps.map(([label, date, done]) => <div key={label} className="flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${done ? "bg-emerald-500" : "bg-slate-300"}`} /><span className={done ? "font-semibold text-slate-700" : "text-slate-400"}>{label}</span><span className="text-slate-400">{date ? formatDate(date) : ""}</span></div>)}{(row.managerRejectReason || row.adminRejectReason) && <p className="mt-2 text-xs font-semibold text-rose-600">{row.managerRejectReason || row.adminRejectReason}</p>}</div>;
  }

  function MiniList({ title, rows = [], left, right, prefix = "" }) {
    return <Section title={title}>{rows.length ? <div className="space-y-2">{rows.map((row, i) => <div key={`${title}-${i}`} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm"><span className={left.toLowerCase().includes("product") ? "font-bold text-slate-900" : ""}>{row[left] || "Unassigned"}</span><span className="shrink-0 text-right">{prefix ? <strong className="font-semibold">{prefix}{row[right] ?? 0}</strong> : <><strong className="rounded bg-indigo-50 px-2 py-1 text-indigo-700">{row[right] ?? 0}</strong><span className="ml-1 text-xs text-slate-500">{right === "quantitySold" ? "units sold" : right === "quantity" ? "units" : ""}</span></>}</span></div>)}</div> : <Empty />}</Section>;
  }

  function Recent({ title, rows = [], primary, secondary }) {
    return <Section title={title}>{rows.length ? <div className="space-y-2">{rows.map((row) => <div key={`${title}-${row.id}`} className="rounded-md border border-slate-100 p-3"><p className="font-semibold">{primary(row)}</p><p className="truncate text-sm text-slate-500">{secondary(row)}</p></div>)}</div> : <Empty />}</Section>;
  }

  function statusBadgeClasses(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "paid") return "bg-green-50 text-green-700 border-green-200";
    if (normalized === "pending") return "bg-yellow-50 text-yellow-700 border-yellow-200";
    if (["failed", "rejected"].includes(normalized)) return "bg-red-50 text-red-700 border-red-200";
    if (normalized === "cash") return "bg-slate-100 text-slate-700 border-slate-200";
    if (normalized === "online") return "bg-cyan-50 text-brand border-cyan-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  }

  function Badge({ children }) {
    return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClasses(children)}`}>{children || "-"}</span>;
  }

  function FinanceMetric({ label, value, tone }) {
    return <div className={`rounded-md border bg-white p-5 shadow-soft ${statusBadgeClasses(tone)}`}><p className="text-sm">{label}</p><p className="mt-2 text-2xl font-semibold">{value ?? 0}</p></div>;
  }

  function fullVariantSku(product, variant) {
    return [product.sku, variant.skuSuffix].filter(Boolean).join("-") || product.sku || "-";
  }

  function CopySku({ value }) {
    const [copied, setCopied] = useState(false);
    const copy = async (event) => {
      event?.stopPropagation?.();
      try {
        await navigator.clipboard.writeText(value || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch {
        alert("Could not copy SKU");
      }
    };
    return (
      <button
        type="button"
        aria-label={`Copy SKU ${value}`}
        title={copied ? "Copied" : "Copy SKU"}
        onClick={copy}
        className="ml-1 inline-grid h-6 w-6 place-items-center rounded border border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-700 transition"
      >
        {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      </button>
    );
  }

  function CompactSku({ value }) {
    const sku = String(value || "").trim();
    if (!sku || sku === "-") return <span className="text-slate-400 font-mono text-xs">-</span>;
    const halfLen = Math.max(4, Math.floor(sku.length / 2));
    const preview = sku.length > 7 ? `${sku.slice(0, halfLen)}…` : sku;
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded bg-indigo-50/80 border border-indigo-100 px-1.5 py-0.5 font-mono text-xs text-indigo-700 font-semibold" title={`Full SKU: ${sku} (Click icon to copy)`}>
        <span className="truncate">{preview}</span>
        <CopySku value={sku} />
      </span>
    );
  }

  function OrderVisualItems({ items = [] }) {
    if (!items || !items.length) return <p className="text-xs text-slate-400 italic">No products listed</p>;
    return (
      <div className="mt-2.5 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Ordered Products ({items.length})</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item, index) => {
            const product = item.Product || item.product || {};
            const variant = item.ProductVariant || item;
            const sku = fullVariantSku(product, variant);
            const rawSku = String(sku || "-");
            const displaySku = rawSku.length > 13 ? `${rawSku.slice(0, 7)}…${rawSku.slice(-4)}` : rawSku;
            const variantText = item.variantName || variant.variantName;
            const colorText = item.colorName || variant.colorName;
            return (
              <div key={item.id || index} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-xs shadow-xs hover:border-slate-300 transition">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {product.image ? (
                    <img src={fileUrl(product.image)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover border border-slate-200 shadow-xs" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-200 text-[10px] font-bold text-slate-500 uppercase">Item</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate" title={product.productName}>{product.productName || "Product"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className="font-mono text-indigo-700 bg-white border border-indigo-200/80 px-2 py-0.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1 shadow-xs max-w-full"
                        title={`Full SKU: ${rawSku}`}
                      >
                        <span className="text-slate-400 font-normal text-[10px]">SKU:</span>
                        <span className="truncate">{displaySku}</span>
                        <CopySku value={rawSku} />
                      </span>
                      {(variantText || colorText) && (
                        <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded-md text-slate-600 font-medium text-[11px] truncate max-w-[130px]" title={`Variant: ${variantText || "Standard"}${colorText ? ` / ${colorText}` : ""}`}>
                          {variantText || "Standard"}{colorText ? ` / ${colorText}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-auto">
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-bold text-emerald-800 text-xs whitespace-nowrap">
                    Quantity: {item.quantity} units
                  </span>
                  {item.price && (
                    <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">
                      {formatMoney(item.price)}/ea
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function ProductTable({ rows, onEdit, onDelete }) {
    const [selected, setSelected] = useState(null);
    const [skuCopied, setSkuCopied] = useState(null);
    const copySku = async (event, sku) => { event.stopPropagation(); try { await navigator.clipboard.writeText(sku || ""); setSkuCopied(sku); setTimeout(() => setSkuCopied(null), 1200); } catch { alert("Could not copy SKU"); } };
    return (
      <>
        <Section title="Company stock">
          {rows.length ? <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr>{["Product name", "Main SKU", "Category", "Price", "Product quantity", "Variants and SKU", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((product) => <tr key={product.id} className="align-top hover:bg-slate-50"><td className="px-4 py-3"><button type="button" onClick={() => setSelected(product)} className="font-bold text-indigo-700 hover:underline">{product.productName}</button><p className="mt-1 text-xs text-slate-500">{formatDate(product.manufacturingDate)} – {formatDate(product.expiryDate)}</p></td><td className="px-4 py-3"><span className="font-mono text-xs font-semibold text-slate-700">{product.sku || "-"}</span><button type="button" onClick={(event) => copySku(event, product.sku)} title="Copy SKU" aria-label="Copy SKU" className="ml-2 inline-grid h-7 w-7 place-items-center rounded border border-slate-200 text-slate-500 hover:text-indigo-700"><Copy size={13} /></button>{skuCopied === product.sku && <span className="ml-1 text-xs text-emerald-700">Copied</span>}</td><td className="px-4 py-3">{product.category || "-"}</td><td className="px-4 py-3">{formatMoney(product.price)}</td><td className="px-4 py-3"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{product.quantity} units</span></td><td className="max-w-md px-4 py-3"><div className="space-y-2">{(product.variants || []).map((variant) => <div key={variant.id || variant.skuSuffix} className="rounded-lg bg-slate-50 p-2"><p className="font-semibold text-slate-900">{variant.variantName} / {variant.colorName || "-"}</p><p className="mt-1 flex items-center font-mono text-xs text-indigo-700">{fullVariantSku(product, variant)}<CopySku value={fullVariantSku(product, variant)} /></p><p className="mt-1 text-xs text-slate-500">Variant quantity: {variant.stockQuantity ?? 0} units</p></div>)}</div></td><td className="px-4 py-3"><StatusBadge value={product.status} /></td><td className="px-4 py-3"><div className="flex gap-1"><Button className="min-h-8 px-2 py-1 text-xs" onClick={() => onEdit(product)}>Edit</Button><Button variant="danger" className="min-h-8 px-2 py-1 text-xs" onClick={() => onDelete(product)}>Delete</Button></div></td></tr>)}</tbody></table></div> : <Empty />}
        </Section>
        {selected && <ProductDetailsModal product={selected} onClose={() => setSelected(null)} />}
      </>
    );
  }

  function VariantEditor({ rows, setRows }) {
    const update = (index, key, value) => setRows(rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
    const add = () => setRows([...rows, { variantName: "", colorName: "", stockQuantity: 0, priceOverride: "", skuSuffix: "", status: "active" }]);
    const remove = (index) => setRows(rows.filter((_, i) => i !== index));
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-semibold text-slate-900">Variant, color and stock</p>
          <Button type="button" variant="ghost" onClick={add}><Plus size={16} /> Add Variant Color Stock</Button>
        </div>
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-md bg-white p-3 md:grid-cols-5">
              <TextField label="Variant name" value={row.variantName} onChange={(e) => update(index, "variantName", e.target.value)} required />
              <TextField label="Color name" value={row.colorName} onChange={(e) => update(index, "colorName", e.target.value)} required />
              <TextField label="Stock quantity" type="number" min="0" value={row.stockQuantity} onChange={(e) => update(index, "stockQuantity", e.target.value)} required />
              <TextField label="Price override" type="number" min="0" value={row.priceOverride} onChange={(e) => update(index, "priceOverride", e.target.value)} />
              <div className="flex items-end"><Button type="button" variant="ghost" disabled={rows.length === 1} onClick={() => remove(index)}>Remove</Button></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ProductModalShell({ title, onClose, children, footer }) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
        <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white shadow-2xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button>
          </div>
          <div className="p-5">{children}</div>
          {footer && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">{footer}</div>}
        </div>
      </div>
    );
  }

  function ProductDetailsModal({ product, onClose }) {
    const detailRows = [
      ["Car image / model", product.productName],
      ["Main SKU", product.sku],
      ["Manufacturing Date", formatDate(product.manufacturingDate)],
      ["Expiry Date", formatDate(product.expiryDate)],
      ["Category", product.category],
      ["Description", product.description],
      ["Price", formatMoney(product.price)],
      ["Low Stock Limit", product.lowStockLimit],
      ["Credit Coins", product.creditCoins || 0],
      ["Available Stock", product.quantity || 0],
      ["Status", product.status]
    ];
    return (
      <ProductModalShell title={product.productName || "Product details"} onClose={onClose}>
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          {product.image ? (
            <img
              src={fileUrl(product.image)}
              alt={product.productName}
              className="h-72 w-full rounded-xl object-cover shadow-sm"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="grid h-72 w-full place-items-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-400">
              No image
            </div>
          )}
          <div className="min-w-0">
            <div className="grid gap-3 sm:grid-cols-2">
              {detailRows.map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-stone-50 p-3 shadow-xs">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  {label === "Main SKU" ? (
                    <div className="mt-1 flex items-center justify-between gap-2 min-w-0 overflow-hidden">
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-indigo-50/80 px-2.5 py-1 font-mono text-xs font-bold text-indigo-700"
                        title={`Full SKU: ${value || "-"}`}
                      >
                        <span className="truncate">
                          {String(value || "-").length > 14
                            ? `${String(value).slice(0, 8)}…${String(value).slice(-4)}`
                            : String(value || "-")}
                        </span>
                        <CopySku value={value} />
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 break-words font-semibold text-slate-900">{value ?? "-"}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 font-semibold text-slate-900">
                Variants and SKU numbers
              </div>
              {(product.variants || []).length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {product.variants.map((variant) => {
                    const variantSku = fullVariantSku(product, variant);
                    return (
                      <div key={variant.id || variant.skuSuffix} className="grid items-center gap-2 px-4 py-3 text-sm md:grid-cols-5">
                        <span className="font-semibold text-slate-900 truncate" title={variant.variantName}>{variant.variantName}</span>
                        <span className="text-slate-600 truncate" title={variant.colorName}>{variant.colorName || "-"}</span>
                        <div className="min-w-0 overflow-hidden">
                          <CompactSku value={variantSku} />
                        </div>
                        <span className="font-medium text-slate-700">{variant.stockQuantity ?? 0} units</span>
                        <div>
                          <StatusBadge value={variant.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-500">No variants for this product</div>
              )}
            </div>
          </div>
        </div>
      </ProductModalShell>
    );
  }

  function ProductEditModal({ product, onClose, onSave }) {
    const [form, setForm] = useState({
      id: product.id,
      productName: product.productName || "",
      category: product.category || "",
      description: product.description || "",
      manufacturingDate: product.manufacturingDate || "",
      expiryDate: product.expiryDate || "",
      price: product.price || 0,
      creditCoins: product.creditCoins || 0,
      status: product.status || "active",
      variants: (product.variants || []).map((variant) => ({ ...variant, priceOverride: variant.priceOverride ?? "" })),
      image: product.image || "",
      imageFile: null
    });
    const [preview, setPreview] = useState(product.image ? fileUrl(product.image) : "");
    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const updateVariant = (index, key, value) => update("variants", form.variants.map((row, i) => i === index ? { ...row, [key]: value } : row));
    const addVariant = () => update("variants", [...form.variants, { variantName: "", colorName: "", stockQuantity: 0, priceOverride: "", status: "active" }]);
    return (
      <ProductModalShell title={`Edit ${productNameWithSku(product)}`} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)}>Save Product</Button></>}>
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">SKU is locked and will not change: <span className="font-mono">{product.sku}</span></div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Product name" value={form.productName} onChange={(e) => update("productName", e.target.value)} required />
          <TextField label="Category" value={form.category} onChange={(e) => update("category", e.target.value)} />
          <TextField label="Manufacturing date" type="date" value={form.manufacturingDate || ""} onChange={(e) => update("manufacturingDate", e.target.value)} />
          <TextField label="Expiry date" type="date" value={form.expiryDate || ""} onChange={(e) => update("expiryDate", e.target.value)} />
          <TextField label="Price" type="number" min="0" value={form.price} onChange={(e) => update("price", e.target.value)} />
          <TextField label="Credit coins" type="number" min="0" value={form.creditCoins} onChange={(e) => update("creditCoins", e.target.value)} />
          <label className="text-sm font-semibold text-slate-600">Status toggle<button type="button" onClick={() => update("status", form.status === "active" ? "inactive" : "active")} className={`mt-1 flex h-11 w-full items-center justify-between rounded-full border px-4 text-sm font-bold ${form.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}><span>{form.status === "active" ? "Active" : "Inactive"}</span><span className={`h-6 w-11 rounded-full p-1 ${form.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${form.status === "active" ? "translate-x-5" : ""}`} /></span></button></label>
          <div><FileUploadPreview label="Product photo" preview={preview} accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; update("imageFile", file); setPreview(URL.createObjectURL(file)); }} /></div>
          <label className="md:col-span-2 text-sm font-semibold text-slate-600">Description<textarea className="mt-1 min-h-28 w-full rounded-md border border-slate-200 p-3 text-sm" value={form.description} onChange={(e) => update("description", e.target.value)} /></label>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><p className="font-semibold text-slate-900">Variants</p><Button type="button" variant="ghost" onClick={addVariant}><Plus size={16} /> Add Variant</Button></div>
          <div className="space-y-3">{form.variants.map((variant, index) => <div key={variant.id || index} className="grid gap-3 rounded-md bg-white p-3 md:grid-cols-6"><TextField label="Variant name" value={variant.variantName || ""} onChange={(e) => updateVariant(index, "variantName", e.target.value)} /><TextField label="Color" value={variant.colorName || ""} onChange={(e) => updateVariant(index, "colorName", e.target.value)} /><TextField label="Stock" type="number" min="0" value={variant.stockQuantity || 0} onChange={(e) => updateVariant(index, "stockQuantity", e.target.value)} /><TextField label="Price override" type="number" min="0" value={variant.priceOverride || ""} onChange={(e) => updateVariant(index, "priceOverride", e.target.value)} /><div><p className="text-sm font-semibold text-slate-600">Variant SKU</p><p className="mt-2 rounded-md bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">{fullVariantSku(product, variant)}</p></div><div className="flex items-end"><button type="button" onClick={() => updateVariant(index, "status", variant.status === "active" ? "inactive" : "active")} className={`rounded-full px-3 py-2 text-xs font-bold ${variant.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{variant.status === "active" ? "Active" : "Inactive"}</button></div></div>)}</div>
        </div>
      </ProductModalShell>
    );
  }

  function DealerPerformancePanel({ data = {}, filters, setFilters, reload, products = [] }) {
    const summary = data.summary || {};
    const charts = data.charts || {};
    const tables = data.tables || {};
    const dealers = data.filters?.dealers || [];
    const areas = data.filters?.areas || [];
    const set = (key, value) => {
      const next = { ...filters, [key]: value, ...(key === "area" ? { dealerId: "" } : {}) };
      setFilters(next);
      reload(next);
    };
    const cards = [
      ["Total orders", summary.totalOrders], ["Approved orders", summary.approvedOrders], ["Delivered orders", summary.deliveredOrders], ["Rejected orders", summary.rejectedOrders],
      ["Purchase amount", formatMoney(summary.totalPurchaseAmount)], ["Paid amount", formatMoney(summary.totalPaidAmount)], ["Pending payment", formatMoney(summary.pendingPaymentAmount)], ["Sales units", summary.totalSalesUnits],
      ["Inventory value", formatMoney(summary.currentInventoryValue)], ["Low stock", summary.lowStockProducts], ["Coins earned", summary.creditCoinsEarned], ["Credit balance", summary.currentCreditBalance]
    ];
    return (
      <div className="space-y-6">
        <Section title="Dealer Performance Filters">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <label className="block"><span className="text-sm font-semibold text-slate-600">Area</span><select className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={filters.area} onChange={(e) => set("area", e.target.value)}><option value="">All areas</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
            <label className="block"><span className="text-sm font-semibold text-slate-600">Dealer</span><select className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={filters.dealerId} onChange={(e) => set("dealerId", e.target.value)}><option value="">Select dealer</option>{dealers.map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.dealerName}</option>)}</select></label>
            <TextField label="Start Date" type="date" value={filters.startDate} onChange={(e) => set("startDate", e.target.value)} />
            <TextField label="End Date" type="date" value={filters.endDate} onChange={(e) => set("endDate", e.target.value)} />
            <label className="block"><span className="text-sm font-semibold text-slate-600">Product</span><select className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={filters.productId} onChange={(e) => set("productId", e.target.value)}><option value="">All products</option>{products.map((p) => <option key={p.id} value={p.id}>{productNameWithSku(p)}</option>)}</select></label>
            <label className="block"><span className="text-sm font-semibold text-slate-600">Payment</span><select className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={filters.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)}><option value="">All</option><option value="paid">Paid</option><option value="pending">Unpaid/Pending</option><option value="cash">Cash</option><option value="online">Online</option></select></label>
          </div>
          {filters.dealerId && <p className="mt-4 text-sm font-semibold text-slate-700">{(() => { const dealer = dealers.find((d) => String(d.id) === String(filters.dealerId)); return dealer ? `${dealer.dealerName} - ${[dealer.area, dealer.city, dealer.pincode].filter(Boolean).join(", ")}` : ""; })()}</p>}
        </Section>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">{cards.map(([label, value]) => <ManagerKpiCard key={label} label={label} value={value ?? 0} />)}</div>
        <div className="grid gap-6 xl:grid-cols-2">
          <ChartBlock title="Monthly purchase amount" data={charts.monthlyPurchases || []} x="month" y="value" />
          <ChartBlock title="Monthly sales units" data={charts.monthlySales || []} x="month" y="value" />
          <PieBlock title="Payment status" data={charts.paymentStatus || []} name="status" />
          <PieBlock title="Order status" data={charts.orderStatus || []} name="status" />
          <ChartBlock title="Product-wise purchase" data={charts.productWisePurchases || []} x="productName" y="quantity" />
          <ChartBlock title="Credit earned vs redeemed" data={charts.creditEarnedRedeemed || []} x="month" y="earned" second="redeemed" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <SimpleTable title="Recent orders" rows={(tables.recentOrders || []).map((o) => ({ order: o.orderNumber, dealer: o.Dealer?.dealerName, status: o.status, amount: formatMoney(o.totalAmount) }))} cols={["order", "dealer", "status", "amount"]} />
          <SimpleTable title="Recent payments" rows={(tables.recentPayments || []).map((p) => ({ dealer: p.Dealer?.dealerName || "Dealer", products: p.Order?.items?.map(orderItemLabel).join(", ") || p.productSummary || "-", amount: formatMoney(p.amount), method: p.paymentMethod || "-", status: p.paymentStatus, date: p.paidAt ? new Date(p.paidAt).toLocaleString() : new Date(p.createdAt).toLocaleString() }))} cols={["dealer", "products", "amount", "method", "status", "date"]} />
          <SimpleTable title="Recent sales" rows={(tables.recentSales || []).map((s) => ({ product: productNameWithSku(s.Product, s.ProductVariant || s), variant: s.variantName || "-", color: s.colorName || "-", quantity: s.quantitySold }))} cols={["product", "variant", "color", "quantity"]} />
          <SimpleTable title="Recent redemptions" rows={(tables.recentRedemptions || []).map((r) => ({ dealer: r.Dealer?.dealerName || "Dealer", reward: r.reward?.title || "-", coins: r.coinsUsed, status: r.status, requested: r.requestedAt ? new Date(r.requestedAt).toLocaleString() : new Date(r.createdAt).toLocaleString(), expectedProvideDate: r.expectedProvideDate || "-" }))} cols={["dealer", "reward", "coins", "status", "requested", "expectedProvideDate"]} />
        </div>
      </div>
    );
  }

  function ChartBlock({ title, data = [], x, y, second }) {
    const money = title.toLowerCase().includes("amount");
    const useArea = title.toLowerCase().includes("monthly") || title.toLowerCase().includes("credit earned");
    const areaId = `dealer-performance-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (useArea) return <Section title={title}>{data.length ? <div className="h-80 min-w-0"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 12, right: 18, left: 14, bottom: 28 }}><defs><linearGradient id={`${areaId}-one`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4F46E5" stopOpacity={0.28} /><stop offset="100%" stopColor="#4F46E5" stopOpacity={0.02} /></linearGradient><linearGradient id={`${areaId}-two`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16A34A" stopOpacity={0.22} /><stop offset="100%" stopColor="#16A34A" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#E8ECF4" strokeDasharray="4 4" vertical={false} /><XAxis dataKey={x} tick={{ fontSize: 11, fill: "#64748B" }} /><YAxis width={money ? 88 : 48} tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(value) => money ? `₹${Number(value || 0).toLocaleString("en-IN")}` : Number(value || 0).toLocaleString("en-IN")} /><Tooltip formatter={(value, name) => [money ? formatMoney(value) : Number(value || 0).toLocaleString("en-IN"), name]} /><Area type="monotone" dataKey={y} name={y === "value" && money ? "Purchase amount" : y} stroke="#4F46E5" strokeWidth={2.5} fill={`url(#${areaId}-one)`} activeDot={{ r: 5 }} animationDuration={1000} />{second && <Area type="monotone" dataKey={second} name={second} stroke="#16A34A" strokeWidth={2.25} fill={`url(#${areaId}-two)`} activeDot={{ r: 5 }} animationDuration={1000} />}</AreaChart></ResponsiveContainer></div> : <Empty />}</Section>;
    return <Section title={title}>{data.length ? <div className="h-80 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 18, left: 22, bottom: 42 }} barCategoryGap="28%"><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={x} interval={0} angle={-25} textAnchor="end" height={62} tick={{ fontSize: 11, fill: "#475569" }} /><YAxis width={78} tick={{ fontSize: 11, fill: "#475569" }} tickFormatter={(value) => money ? `₹${Number(value || 0).toLocaleString("en-IN")}` : value} /><Tooltip formatter={(value, name) => [money ? formatMoney(value) : value, name]} /><Bar dataKey={y} fill="#2563EB" maxBarSize={42} />{second && <Bar dataKey={second} fill="#F59E0B" maxBarSize={42} />}</BarChart></ResponsiveContainer></div> : <Empty />}</Section>;
  }

  function PieBlock({ title, data = [], name }) {
    return <Section title={title}>{data.length ? <div className="h-72"><ResponsiveContainer><PieChart><Pie data={data} dataKey="count" nameKey={name} innerRadius={54} outerRadius={88} paddingAngle={4} stroke="white" strokeWidth={3} animationDuration={900}>{data.map((entry, index) => <Cell key={entry[name]} fill={["#4F46E5", "#16A34A", "#F59E0B", "#EF4444", "#64748B"][index % 5]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" height={28} /></PieChart></ResponsiveContainer></div> : <Empty />}</Section>;
  }

  function CreditManagement({ data, form, setForm, preview, setPreview, setImage, createReward, updateRedemption, reload }) {
    const summary = data.credit_summary || {};
    const rewards = data.credit_rewards || [];
    const redemptions = data.credit_redemptions || [];
    const cards = [
      ["Total rewards", summary.totalRewards], ["Active rewards", summary.activeRewards], ["Total redemptions", summary.totalRedemptions], ["Pending redemptions", summary.pendingRedemptions],
      ["Completed", summary.completedRedemptions], ["Coins redeemed", summary.totalCoinsRedeemed], ["Remaining stock", summary.remainingRewardStock], ["Coins issued", summary.totalCreditCoinsIssued]
    ];
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <Card key={label} label={label} value={value ?? 0} />)}</div>
        <Section title="Create reward">
          <FormGrid onSubmit={createReward}>
            {Object.keys(form).map((k) => <TextField key={k} label={k.replace(/([A-Z])/g, " $1")} type={["requiredCoins", "quantity"].includes(k) ? "number" : "text"} min={["requiredCoins", "quantity"].includes(k) ? "0" : undefined} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={["title", "requiredCoins", "quantity"].includes(k)} />)}
            <FileUploadPreview label="Reward image" preview={preview} accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; setImage(file || null); setPreview(file ? URL.createObjectURL(file) : ""); }} />
            <div className="md:col-span-2"><Button type="submit"><Gift size={16} /> Save Reward</Button></div>
          </FormGrid>
        </Section>
        <Section title="Reward list">{rewards.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rewards.map((reward) => <div key={reward.id} className="rounded-md border border-slate-200 p-4">{reward.image ? <img src={fileUrl(reward.image)} alt={reward.title} className="mb-3 h-32 w-full rounded-md object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div className="mb-3 h-32 rounded-md bg-slate-100" />}<div className="flex justify-between gap-3"><div><p className="font-semibold">{reward.title}</p><p className="text-sm text-slate-500">{reward.category || "General"}</p></div><StatusBadge value={reward.status} /></div><p className="mt-2 text-sm text-slate-600">{reward.description}</p><p className="mt-3 font-semibold">{reward.requiredCoins} coins | {reward.quantity} left</p></div>)}</div> : <Empty />}</Section>
        <Section title="Redemption requests">{redemptions.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Dealer", "Reward", "Coins", "Status", "Requested", "Provide Date", "Actions"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{redemptions.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="p-3">{r.Dealer?.dealerName || r.dealerId}</td><td>{r.reward?.title}</td><td>{r.coinsUsed}</td><td><StatusBadge value={r.status} /></td><td>{new Date(r.requestedAt || r.createdAt).toLocaleString()}</td><td><input className="rounded-md border border-slate-200 px-2 py-1" type="date" defaultValue={r.expectedProvideDate || ""} onBlur={(e) => e.target.value && updateRedemption(r.id, { status: r.status, expectedProvideDate: e.target.value })} /></td><td className="space-x-2"><Button variant="ghost" onClick={() => updateRedemption(r.id, { status: "APPROVED" })}>Approve</Button><Button onClick={() => updateRedemption(r.id, { status: "PROVIDED" })}>Provided</Button><Button variant="danger" onClick={() => updateRedemption(r.id, { status: "CANCELLED", adminNote: prompt("Cancel note") || "" })}>Cancel</Button></td></tr>)}</tbody></table></div> : <Empty />}</Section>
      </div>
    );
  }

  function SimpleTable({ title, rows = [], cols, renderCell }) {
    const columnLabel = (column) => {
      let text = column.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ");
      try {
        return formatTitleCase(text);
      } catch {
        return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
      }
    };
    return <Section title={typeof title === 'string' ? formatTitleCase(title) : title}>{rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{cols.map((c) => <th className="p-3" key={c}>{columnLabel(c)}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr className={`border-t border-slate-100 ${i % 2 ? "bg-stone-50/70" : "bg-white"} hover:bg-slate-50`} key={row.id || i}>{cols.map((c) => { const customCell = renderCell?.(row, c); return <td className="p-3" key={c}>{customCell ?? (c === "quantity" || c === "quantitySold" || c === "stockQuantity" ? <span className="inline-flex items-center gap-1.5"><span className="rounded bg-indigo-50 px-2 py-1 font-bold text-indigo-700">{row[c] ?? 0}</span><span className="text-xs text-slate-500">{c === "quantitySold" ? "sold" : "units"}</span></span> : c === "product" || c === "productName" ? <span className="font-bold text-slate-900">{String(row[c] ?? "-")}</span> : String(row[c] ?? ""))}</td>; })}</tr>)}</tbody></table></div> : <Empty />}</Section>;
  }

  function AdminDealerSales({ data = {} }) {
    const rows = data.rows || [];
    const stats = data.stats || {};
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card label="Total Sold Units" value={stats.totalSoldUnits || 0} />
          <Card label="Products Sold" value={(stats.topProducts || []).length} />
          <Card label="Active Dealers" value={(stats.dealerPerformance || []).length} />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <MiniList title="Top selling products" rows={(stats.topProducts || []).map((row) => ({ ...row, productName: rowNameWithSku(row) }))} left="productName" right="quantitySold" />
          <MiniList title="Dealer sales performance" rows={stats.dealerPerformance || []} left="dealerName" right="quantitySold" />
        </div>
        <Section title="Dealer sales records">
          {rows.length ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    {["Date", "Dealer", "Product", "SKU Code", "Variant", "Quantity Sold", "Stock Impact", "Remarks", "Created"].map((h) => (
                      <th className="p-3 font-semibold text-xs uppercase tracking-wider" key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((sale) => (
                    <tr className="hover:bg-slate-50/60 transition-colors" key={sale.id}>
                      <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">{sale.saleDate ? formatDate(sale.saleDate) : "-"}</td>
                      <td className="p-3 font-medium text-slate-800">{sale.Dealer?.dealerName || `Dealer #${sale.dealerId}`}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {sale.Product?.image && <img src={fileUrl(sale.Product.image)} alt="" className="h-9 w-9 rounded-md object-cover border border-slate-200" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                          <span className="font-semibold text-slate-900">{sale.Product?.productName || "Product"}</span>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <CompactSku value={fullVariantSku(sale.Product || {}, sale.ProductVariant || sale)} />
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {sale.variantName || sale.colorName ? (
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {sale.variantName || "Standard"}{sale.colorName ? ` / ${sale.colorName}` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Standard</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                          {sale.quantitySold} units
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap font-mono text-xs text-slate-600">
                        {sale.stockBefore ?? "-"} → <span className="font-bold text-indigo-700">{sale.stockAfter ?? "-"}</span>
                      </td>
                      <td className="p-3 max-w-[200px] text-xs text-slate-600 truncate" title={sale.remarks || ""}>{sale.remarks || <span className="text-slate-300 italic">None</span>}</td>
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{sale.createdAt ? new Date(sale.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="No dealer sales recorded yet" />
          )}
        </Section>
      </div>
    );
  }

  function InternalUpdates({ data = {}, filter, setFilter, markRead, markAll, clearRead, openChat }) {
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const rows = data.rows || [];
    const filterMap = { unread: (n) => !n.isRead, read: (n) => n.isRead, low_stock: (n) => n.type === "LOW_STOCK" };
    const filtered = rows.filter(filterMap[filter] || (() => true));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
    
    const handleNotificationClick = (n) => {
      if (n.title === "New Team Message" || n.title === "New Personal Message") {
        if (!n.isRead) markRead(n.id);
        if (openChat) openChat(n.metadata?.senderId || "common");
      }
    };
    
    return (
      <Section title="Internal Updates" actions={<div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={markAll}>Mark all as read</Button><Button variant="danger" onClick={clearRead}>Clear read updates</Button></div>}>
        <div className="mb-4 flex flex-wrap gap-2">{["all", "unread", "read", "low_stock"].map((f) => <button key={f} onClick={() => { setFilter(f); setPage(1); }} className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === f ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{f.replaceAll("_", " ")}</button>)}</div>
        {visible.length ? <><div className="space-y-3">{visible.map((n) => <div key={n.id} onClick={() => handleNotificationClick(n)} className={`rounded-md border p-4 cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md ${n.type === "LOW_STOCK" ? "border-yellow-200 bg-yellow-50" : n.type === "PAYMENT" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><NotificationBadge value={n.isRead ? "Read" : "Unread"} />{["LOW_STOCK", "PAYMENT", "SALES_UPDATE"].includes(n.type) && <NotificationBadge value={n.type} />}</div><p className="mt-2 font-semibold text-slate-900">{n.title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{n.message}</p><NotificationMeta notification={n} /><p className="mt-2 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString()}</p></div>{!n.isRead && <Button variant="ghost" onClick={(e) => { e.stopPropagation(); markRead(n.id); }}>Mark read</Button>}</div></div>)}</div><div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between text-sm"><span className="text-xs sm:text-sm font-medium text-slate-600 text-center sm:text-left">Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span><div className="flex flex-wrap items-center justify-center sm:justify-end gap-2"><Button variant="ghost" size="sm" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="px-3 py-1.5 text-xs sm:text-sm">Previous</Button><span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700">{safePage} / {totalPages}</span><Button variant="ghost" size="sm" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)} className="px-3 py-1.5 text-xs sm:text-sm">Next</Button></div></div></> : <Empty text="No internal updates found" />}
      </Section>
    );
  }

  function NotificationMeta({ notification }) {
    const meta = notification.metadata || {};
    const rows = [
      ["Product", meta.productName],
      ["Organization", meta.organizationName || meta.companyName],
      ["Dealer", meta.dealerName],
      ["Order", meta.orderNumber],
      ["Current Stock", meta.stockAfter],
      ["Low Stock Limit", meta.lowStockLimit]
    ].filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (!rows.length) return null;
    return <div className="mt-3 flex flex-wrap gap-2">{rows.map(([label, value]) => <span key={label} className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-700">{label}: {value}</span>)}</div>;
  }

  function NotificationBadge({ value }) {
    const tone = String(value || "").toUpperCase();
    const classes = tone === "CRITICAL" ? "border-red-200 bg-red-100 text-red-700" : tone === "HIGH" || tone === "LOW_STOCK" ? "border-yellow-200 bg-yellow-100 text-yellow-800" : tone === "UNREAD" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600";
    return <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${classes}`}>{String(value).replaceAll("_", " ")}</span>;
  }

  function InventoryBoard({ products = [], dealerStock = [] }) {
    const [selectedProduct, setSelectedProduct] = useState(null);
    const lowStock = products.filter((p) => Number(p.quantity) <= Number(p.lowStockLimit || 0));
    const topStock = [...products].sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0)).slice(0, 6);
    const totalStock = products.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card label="Company Products" value={products.length} />
          <Card label="Company Stock" value={totalStock} />
          <Card label="Low Stock Products" value={lowStock.length} />
          <Card label="Dealer Stock Rows" value={dealerStock.length} />
        </div>
        <Section title="Company stock inventory" actions={<span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">Click any product for full details</span>}>
          {products.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => {
            const qty = Number(product.quantity || 0);
            const limit = Number(product.lowStockLimit || 0);
            const stockStatus = qty === 0 ? "Out of Stock" : qty <= limit ? "Low Stock" : "In Stock";
            return (
              <button key={product.id} type="button" onClick={() => setSelectedProduct(product)} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-card transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover">
                <div className="flex gap-4">
                  {product.image ? <img src={fileUrl(product.image)} alt={product.productName} className="h-20 w-24 rounded-xl object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div className="grid h-20 w-24 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-400">No image</div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-950 group-hover:text-indigo-700" title={product.productName}>{product.productName}</p>
                    <p className="mt-1 truncate"><CompactSku value={product.sku} /></p>
                    <p className="mt-1 text-xs text-slate-500">{product.category || "Uncategorized"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge value={stockStatus} /><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{qty} in company stock</span></div>
                  </div>
                </div>
                {(product.variants || []).length > 0 && <p className="mt-3 line-clamp-2 text-xs text-slate-500">{product.variants.map((variant) => `${variant.variantName}/${variant.colorName}: ${fullVariantSku(product, variant)}`).join(", ")}</p>}
              </button>
            );
          })}</div> : <Empty text="No company stock products found" />}
        </Section>
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Low stock attention">
            {lowStock.length ? <div className="space-y-3">{lowStock.map((p) => <StockHealth key={p.id} product={p} />)}</div> : <Empty text="No low stock products" />}
          </Section>
          <Section title="Top stock products">
            {topStock.length ? <div className="space-y-3">{topStock.map((p) => <StockHealth key={p.id} product={p} />)}</div> : <Empty />}
          </Section>
        </div>
        <SimpleTable title="Dealer-wise stock allocation" rows={dealerStock.map((s) => {
          const qty = Number(s.quantity || 0);
          const limit = Number(s.lowStockLimit || 0);
          return {
            dealer: s.Dealer?.dealerName || "Dealer",
            location: [s.Dealer?.area, s.Dealer?.city].filter(Boolean).join(", "),
            product: s.Product?.productName || "Product",
            sku: fullVariantSku(s.Product || { sku: "-" }, s.ProductVariant || s),
            variant: s.variantName || "-",
            color: s.colorName || "-",
            quantity: qty,
            lowStockLimit: limit,
            status: qty === 0 ? "Out of Stock" : qty <= limit ? "Low Stock" : "In Stock"
          };
        })} cols={["dealer", "location", "product", "sku", "variant", "color", "quantity", "lowStockLimit", "status"]} renderCell={(row, column) => column === "sku" ? <CompactSku value={row.sku} /> : undefined} />
        {selectedProduct && <ProductDetailsModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
      </div>
    );
  }

  function StockHealth({ product }) {
    const quantity = Number(product.quantity || 0);
    const limit = Number(product.lowStockLimit || 1);
    const percentage = Math.min(100, Math.round((quantity / Math.max(limit * 3, 1)) * 100));
    const low = quantity <= limit;
    return (
      <div className="rounded-md border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900" title={product.productName}>{product.productName || "Product"}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500"><CompactSku value={product.sku} /><span>Low stock limit {limit}</span></p>
          </div>
          <StatusBadge value={low ? "low" : "active"} />
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percentage}%` }} />
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-700">{quantity} units available</p>
      </div>
    );
  }

  function PaginationControls({ page, setPage, totalPages, totalItems, pageSize }) {
    const start = totalItems ? (page - 1) * pageSize + 1 : 0;
    const end = Math.min(page * pageSize, totalItems);
    return <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-slate-500">Showing {start}-{end} of {totalItems}</p><div className="flex items-center gap-2"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">{page} / {totalPages}</span><Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>;
  }

  function DeliveryManagement({ rows = [], updateOrder, filter = "all", setFilter, page = 1, setPage }) {
    const next = { approved: "packing", packing: "shipping", shipping: "out_for_delivery", out_for_delivery: "delivered" };
    const dealerTitle = (order) => `${order.Dealer?.dealerName || "Dealer"}${order.Dealer?.area || order.Dealer?.city ? ` - ${[order.Dealer?.area, order.Dealer?.city].filter(Boolean).join(", ")}` : ""}`;
    const pageSize = 8;
    const filtered = rows.filter((order) => filter === "all" || order.status === filter);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
    return (
      <Section title="Delivery management" actions={<div className="flex flex-wrap gap-2">{["all", "approved", "packing", "shipping", "out_for_delivery", "delivered"].map((status) => <button key={status} onClick={() => { setFilter(status); setPage(1); }} className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === status ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{status.replaceAll("_", " ")}</button>)}</div>}>
        {visible.length ? <><div className="grid gap-4 xl:grid-cols-2">{visible.map((order) => (
          <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="font-bold text-slate-900 text-base">{dealerTitle(order)}</p>
                <p className="mt-0.5 text-xs text-slate-500">Reference: #{order.orderNumber} · Ordered: {new Date(order.createdAt).toLocaleDateString()}</p>
              </div>
              <StatusBadge value={order.status} />
            </div>
            <OrderVisualItems items={order.items} />
            <div className="mt-4 pt-3 border-t border-slate-100">
              <DeliveryTimeline order={order} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-600">
                  Expected delivery: <strong className="text-slate-800">{order.deliveredDate || "-"}</strong>
                </span>
                {order.status === "delivered" ? (
                  <span className="rounded-md bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">Delivered</span>
                ) : (
                  <Button onClick={() => updateOrder(order.id, next[order.status])}>Mark as {next[order.status]?.replaceAll("_", " ")}</Button>
                )}
              </div>
            </div>
          </div>
        ))}</div><PaginationControls page={safePage} setPage={setPage} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize} /></> : <Empty text="No deliveries match this filter" />}
      </Section>
    );
  }

  function AdminCeoReadOnlyOverview({ endpoint, type }) {
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const load = (force = false) => {
      setLoading(true);
      return cachedGet(api, endpoint, {}, { force }).then(({ data }) => setPayload(data)).finally(() => setLoading(false));
    };
    useEffect(() => {
      let active = true;
      setLoading(true);
      cachedGet(api, endpoint).then(({ data }) => {
        if (active) setPayload(data);
      }).finally(() => {
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }, [endpoint]);
    if (loading) return <Loading />;
    const controlDealer = async (dealer) => {
      const action = dealer.status === "active" ? "suspend" : "reactivate";
      if (!window.confirm(`${action === "suspend" ? "Suspend" : "Reactivate"} ${dealer.dealerName}?`)) return;
      await api.patch(`/admin-ceo/dealers/${dealer.id}/${action}`);
      await load(true);
    };
    const controlProduct = async (product) => {
      const action = product.status === "active" ? "disband" : "reactivate";
      if (!window.confirm(`${action === "disband" ? "Deactivate" : "Reactivate"} ${product.productName}?`)) return;
      await api.patch(`/admin-ceo/products/${product.id}/${action}`);
      await load(true);
    };
    const stats = payload?.stats || payload?.totals || {};
    const statRows = Object.entries(stats).filter(([, value]) => typeof value !== "object").slice(0, 8);
    const moneyKeys = ["revenue", "paidAmount", "unpaidAmount", "totalRevenue", "pendingPayment", "creditOutstanding", "outstandingBalance"];
    const statValue = (key, value) => moneyKeys.some((item) => key.toLowerCase().includes(item.toLowerCase())) ? formatMoney(value) : value;
    return (
      <div className="space-y-4 sm:space-y-5">
        {!['dashboard', 'dealers', 'products', 'orders', 'delivery', 'finance', 'credit'].includes(type) && statRows.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statRows.map(([key, value]) => <Card key={key} label={key.replace(/([A-Z])/g, " $1")} value={statValue(key, value)} />)}
          </div>
        )}
        {type === "dashboard" && <AdminCeoAnalyticsDashboard payload={payload} />}
        {type === "dealers" && <AdminCeoDealersOverview payload={payload} onControlDealer={controlDealer} />}
        {type === "products" && <AdminCeoProductsOverview payload={payload} onControlProduct={controlProduct} onRefresh={load} />}
        {type === "orders" && <AdminCeoOrdersOverview payload={payload} />}
        {type === "delivery" && <AdminCeoDeliveryOverview payload={payload} />}
        {type === "finance" && <AdminCeoFinanceOverview payload={payload} />}
        {type === "credit" && <AdminCeoCreditOverview payload={payload} />}
      </div>
    );
  }

  function orderRow(order) {
    return {
      dealer: order.Dealer?.dealerName || "-",
      location: [order.Dealer?.area, order.Dealer?.city].filter(Boolean).join(", "),
      products: order.items?.map(orderItemLabel).join(", "),
      amount: formatMoney(order.totalAmount),
      status: order.status,
      orderDate: order.createdAt,
      deliveryDate: order.deliveryDate || "-"
    };
  }

  function LicenseCenter({ status = {}, reload }) {
    const [planId, setPlanId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const plans = status?.plans || [];
    const request = async (event) => {
      event.preventDefault();
      if (!planId) return window.alert("Select a license plan");
      setSubmitting(true);
      try {
        await api.post("/admin/license-requests", { licensePlanId: Number(planId), quantity: Number(quantity), note });
        setNote("");
        await reload();
        window.alert("License purchase request sent successfully");
      } catch (error) {
        window.alert(error.response?.data?.message || "Unable to request licenses");
      } finally { setSubmitting(false); }
    };
    const changeAllocation = async (dealer) => {
      const value = window.prompt(`Licenses to allocate to ${dealer.dealerName}`, String(dealer.allocatedLicenses));
      if (value == null) return;
      try {
        await api.patch(`/admin/dealers/${dealer.id}/licenses`, { allocatedLicenses: Number(value) });
        await reload();
      } catch (error) { window.alert(error.response?.data?.message || "Unable to update allocation"); }
    };
    return <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card label="Total licenses" value={status?.totalLicenses ?? 0} />
        <Card label="Licenses in use" value={status?.usedLicenses ?? 0} />
        <Card label="Available licenses" value={status?.availableLicenses ?? 0} />
      </div>
      <Section title="Get more licenses">
        <p className="mb-5 text-sm text-slate-600">Every organization admin, manager, dealer owner, and dealer manager uses one license. Dealer allocations are reserved from your available organization licenses.</p>
        <FormGrid onSubmit={request}>
          <Select label="License plan" value={planId} onChange={(e) => setPlanId(e.target.value)} required><option value="">Select plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.dealerLimit} licenses — {formatMoney(plan.price)}</option>)}</Select>
          <TextField label="Plan quantity" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          <div className="md:col-span-2"><TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={submitting || !plans.length}>{submitting ? "Sending..." : "Request More Licenses"}</Button></div>
        </FormGrid>
        {!plans.length && <p className="mt-4 text-sm font-semibold text-amber-700">No active license plans are available. Contact the Super Admin.</p>}
      </Section>
      <Section title="Dealer allocations">
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Dealer</th><th className="p-3">Allocated licenses</th><th className="p-3">Action</th></tr></thead><tbody>{(status?.dealers || []).map((dealer) => <tr key={dealer.id} className="border-t border-slate-100"><td className="p-3 font-semibold">{dealer.dealerName}</td><td className="p-3">{dealer.allocatedLicenses}</td><td className="p-3"><Button variant="ghost" onClick={() => changeAllocation(dealer)}>Change allocation</Button></td></tr>)}</tbody></table></div>
      </Section>
    </div>;
  }

  function AdminManagers() {
    const [rows, setRows] = useState([]);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "", role: "DEALER_MANAGER" });
    const [selectedManager, setSelectedManager] = useState(null);
    const [editingManager, setEditingManager] = useState(null);
    const [deletingManager, setDeletingManager] = useState(null);
    const [formErrors, setFormErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [formSuccess, setFormSuccess] = useState("");
    const [creating, setCreating] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const load = (force = false) => cachedGet(api, "/admin-ceo/managers", {}, { force }).then(({ data }) => setRows(data));
    useEffect(() => { load(); }, []);

    const validateCreate = () => {
      const errs = {};
      if (!String(form.name || "").trim()) errs.name = "Manager name is required";
      if (!String(form.email || "").trim()) {
        errs.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        errs.email = "Enter a valid email address";
      }
      if (!form.phone || !String(form.phone).trim()) {
        errs.phone = "Phone number is required";
      } else if (!/^\d{10}$/.test(form.phone)) {
        errs.phone = "Phone must be exactly 10 digits";
      }
      if (!form.password) {
        errs.password = "Password is required";
      } else if (form.password.length < 6) {
        errs.password = "Password must be at least 6 characters";
      }
      if (!form.confirmPassword) {
        errs.confirmPassword = "Confirm password is required";
      } else if (form.password !== form.confirmPassword) {
        errs.confirmPassword = "Passwords do not match";
      }
      setFormErrors(errs);
      return Object.keys(errs).length === 0;
    };

    const createManager = async (e) => {
      e?.preventDefault();
      setFormError("");
      setFormSuccess("");
      if (!validateCreate()) return;
      setCreating(true);
      try {
        await api.post("/admin-ceo/managers", form);
        setForm({ name: "", email: "", phone: "", password: "", confirmPassword: "", role: "DEALER_MANAGER" });
        setFormErrors({});
        setFormSuccess("Manager created successfully!");
        setTimeout(() => setFormSuccess(""), 4000);
        await load(true);
      } catch (error) {
        setFormError(error.response?.data?.message || "Unable to create manager");
      } finally {
        setCreating(false);
      }
    };

    const setStatus = async (id, status) => {
      try {
        await api.patch(`/admin-ceo/managers/${id}/status`, { status });
        await load(true);
      } catch (err) {
        setFormError(err.response?.data?.message || "Failed to update status");
      }
    };

    const editManager = (manager) => {
      setEditingManager({ ...manager });
    };

    const saveEdit = async (e) => {
      e?.preventDefault();
      if (!String(editingManager.name || "").trim()) {
        alert("Name is required");
        return;
      }
      if (editingManager.phone && !/^\d{10}$/.test(editingManager.phone)) {
        alert("Phone must be exactly 10 digits");
        return;
      }
      setSavingEdit(true);
      try {
        await api.put(`/admin-ceo/managers/${editingManager.id}`, { name: editingManager.name, phone: editingManager.phone, role: editingManager.role });
        setEditingManager(null);
        await load(true);
      } catch (err) {
        alert(err.response?.data?.message || "Failed to update manager");
      } finally {
        setSavingEdit(false);
      }
    };

    const confirmDeleteManager = async () => {
      if (!deletingManager) return;
      setDeleting(true);
      try {
        await api.delete(`/admin-ceo/managers/${deletingManager.id}`);
        setDeletingManager(null);
        await load(true);
      } catch (err) {
        setFormError(err.response?.data?.message || "Failed to delete manager");
      } finally {
        setDeleting(false);
      }
    };

    return (
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Section title="Create Admin Manager">
          {formError && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{formError}</div>}
          {formSuccess && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">{formSuccess}</div>}
          <FormGrid onSubmit={createManager} noValidate>
            <div>
              <TextField label="Name" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); if (formErrors.name) setFormErrors({ ...formErrors, name: "" }); }} placeholder="Manager full name" />
              {formErrors.name && <p className="mt-1 text-xs font-semibold text-rose-600">{formErrors.name}</p>}
            </div>
            <div>
              <TextField label="Email" type="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); if (formErrors.email) setFormErrors({ ...formErrors, email: "" }); }} placeholder="manager@company.com" />
              {formErrors.email && <p className="mt-1 text-xs font-semibold text-rose-600">{formErrors.email}</p>}
            </div>
            <div>
              <TextField label="Phone" type="tel" maxLength={10} value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value.replace(/\D/g, '') }); if (formErrors.phone) setFormErrors({ ...formErrors, phone: "" }); }} placeholder="10-digit phone number" />
              {formErrors.phone && <p className="mt-1 text-xs font-semibold text-rose-600">{formErrors.phone}</p>}
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-600">Role<select className="mt-1 w-full rounded-md border border-slate-200 p-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="DEALER_MANAGER">Dealer Manager</option><option value="PRODUCT_DELIVERY_MANAGER">Product Delivery Manager</option><option value="FINANCE_MANAGER">Finance Manager</option></select></label>
            </div>
            <div>
              <TextField label="Password" type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); if (formErrors.password) setFormErrors({ ...formErrors, password: "" }); }} placeholder="Minimum 6 characters" suffix={<button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-slate-600 focus:outline-none">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />
              {formErrors.password && <p className="mt-1 text-xs font-semibold text-rose-600">{formErrors.password}</p>}
            </div>
            <div>
              <TextField label="Confirm Password" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={(e) => { setForm({ ...form, confirmPassword: e.target.value }); if (formErrors.confirmPassword) setFormErrors({ ...formErrors, confirmPassword: "" }); }} placeholder="Re-enter password" suffix={<button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-slate-400 hover:text-slate-600 focus:outline-none">{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />
              {formErrors.confirmPassword && <p className="mt-1 text-xs font-semibold text-rose-600">{formErrors.confirmPassword}</p>}
            </div>
            <div className="md:col-span-2 pt-2"><Button type="submit" disabled={creating} className="relative z-10 cursor-pointer w-full sm:w-auto">{creating ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />} {creating ? "Creating Manager..." : "Create Manager"}</Button></div>
          </FormGrid>
        </Section>
        <Section title="Organization Managers">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Name", "Role", "Status", "Actions"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="p-3"><button type="button" className="font-semibold text-indigo-700 hover:underline cursor-pointer" onClick={() => setSelectedManager(row)}>{row.name}</button></td><td><StatusBadge value={row.role} /></td><td><button type="button" className="cursor-pointer" aria-label={`Set ${row.name} ${row.status === "active" ? "inactive" : "active"}`} onClick={() => setStatus(row.id, row.status === "active" ? "inactive" : "active")}><StatusBadge value={row.status} /></button></td><td><div className="flex flex-nowrap gap-2 relative z-10"><button type="button" title="Edit manager" aria-label={`Edit ${row.name}`} className="relative z-10 cursor-pointer rounded-md border border-indigo-200 p-2 text-indigo-700 hover:bg-indigo-50 active:scale-95 transition" onClick={() => editManager(row)}><Pencil size={16} /></button><button type="button" title="Delete manager" aria-label={`Delete ${row.name}`} className="relative z-10 cursor-pointer rounded-md border border-rose-200 p-2 text-rose-700 hover:bg-rose-50 active:scale-95 transition" onClick={() => setDeletingManager(row)}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table>
            {!rows.length && <div className="p-6 text-center text-sm text-slate-400">No managers created yet.</div>}
          </div>
        </Section>
        {selectedManager && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={() => setSelectedManager(null)}><div role="dialog" aria-modal="true" aria-labelledby="manager-details-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><h2 id="manager-details-title" className="text-xl font-bold text-slate-950">{selectedManager.name}</h2><p className="mt-1 text-sm text-slate-500">Complete Manager Details</p></div><button type="button" aria-label="Close manager details" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 cursor-pointer" onClick={() => setSelectedManager(null)}><X size={18} /></button></div><dl className="mt-6 grid gap-4 sm:grid-cols-2">{[["Email", selectedManager.email], ["Phone", selectedManager.phone || "-"], ["Role", String(selectedManager.role || "-").replaceAll("_", " ")], ["Status", selectedManager.status], ["Created", formatDate(selectedManager.createdAt)]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold capitalize text-slate-900">{value}</dd></div>)}</dl></div></div>}
        {editingManager && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={() => setEditingManager(null)}><div role="dialog" aria-modal="true" aria-labelledby="manager-edit-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><h2 id="manager-edit-title" className="text-xl font-bold text-slate-950">Edit {editingManager.name}</h2><p className="mt-1 text-sm text-slate-500">Update Manager Details</p></div><button type="button" aria-label="Close edit manager" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 cursor-pointer" onClick={() => setEditingManager(null)}><X size={18} /></button></div><form onSubmit={saveEdit} className="mt-6 space-y-4"><TextField label="Name" value={editingManager.name} onChange={(e) => setEditingManager({ ...editingManager, name: e.target.value })} required /><TextField label="Phone" type="tel" maxLength={10} value={editingManager.phone || ""} onChange={(e) => setEditingManager({ ...editingManager, phone: e.target.value.replace(/\D/g, '') })} placeholder="10-digit phone number" /><label className="text-sm font-semibold text-slate-600">Role<select className="mt-1 w-full rounded-md border border-slate-200 p-2.5" value={editingManager.role} onChange={(e) => setEditingManager({ ...editingManager, role: e.target.value })}><option value="DEALER_MANAGER">Dealer Manager</option><option value="PRODUCT_DELIVERY_MANAGER">Product Delivery Manager</option><option value="FINANCE_MANAGER">Finance Manager</option></select></label><div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer" onClick={() => setEditingManager(null)}>Cancel</Button><Button type="submit" disabled={savingEdit} className="cursor-pointer">{savingEdit ? <RefreshCw size={16} className="animate-spin" /> : null} {savingEdit ? "Saving Changes..." : "Save Changes"}</Button></div></form></div></div>}
        {deletingManager && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={() => setDeletingManager(null)}>
            <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-100 text-rose-600">
                  <Trash2 size={20} />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Delete Manager</h2>
                  <p className="text-xs text-slate-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                Are you sure you want to permanently delete <strong className="text-slate-900">{deletingManager.name}</strong> from the database?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setDeletingManager(null)} className="cursor-pointer">Cancel</Button>
                <Button type="button" variant="danger" disabled={deleting} onClick={confirmDeleteManager} className="cursor-pointer">
                  {deleting ? "Deleting..." : "Delete Manager"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function EditDealerModal({ dealer, onClose, onSave }) {
    const [form, setForm] = useState({
      dealerName: dealer.dealerName || "",
      ownerName: dealer.ownerName || "",
      email: dealer.email || "",
      phone: dealer.phone || "",
      allocatedLicenses: dealer.allocatedLicenses || 1,
      state: dealer.state || "",
      city: dealer.city || "",
      pincode: dealer.pincode || "",
      address: dealer.address || "",
      status: dealer.status || "active"
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (form.pincode && !/^\d{6}$/.test(String(form.pincode))) {
        setError("Pincode must be exactly 6 digits");
        return;
      }
      if (form.phone && !/^\d{10}$/.test(String(form.phone))) {
        setError("Phone must be exactly 10 digits");
        return;
      }
      setSaving(true);
      setError("");
      try {
        await onSave(dealer.id, form);
        onClose();
      } catch (err) {
        setError(err.response?.data?.message || "Failed to update dealer");
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
        <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Edit Dealer: {dealer.dealerName}</h2>
              <p className="mt-1 text-sm text-slate-500">Update dealer profile, contact, license allocation and status.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Dealer Name" value={form.dealerName} onChange={(e) => setForm({ ...form, dealerName: e.target.value })} required />
              <TextField label="Owner Name" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required />
              <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <TextField label="Phone" type="tel" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} required />
              <TextField label="Allocated Licenses" type="number" min="1" value={form.allocatedLicenses} onChange={(e) => setForm({ ...form, allocatedLicenses: e.target.value })} required />
              <label className="text-sm font-semibold text-slate-600">Status
                <select className="mt-1 w-full rounded-md border border-slate-200 p-2.5" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="blocked">Blocked</option>
                </select>
              </label>
              <SearchableSelect label="State" options={Object.keys(INDIA_STATES_CITIES)} value={form.state} onChange={(val) => setForm({ ...form, state: val, city: "" })} placeholder="Select State..." required />
              <SearchableSelect label="City" options={INDIA_STATES_CITIES[form.state] || []} value={form.city} onChange={(val) => setForm({ ...form, city: val })} placeholder="Select City..." required disabled={!form.state} />
              <TextField label="Pincode" maxLength={6} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '') })} required />
              <div className="sm:col-span-2">
                <TextField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function DealerManagersModal({ dealer, onClose, onRefresh }) {
    const [managers, setManagers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "DEALER_STOCK_INVENTORY_MANAGER" });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const loadManagers = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/admin/dealers/${dealer.id}/managers`);
        setManagers(res.data || []);
      } catch (err) {
        setError("Failed to load dealer managers");
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => { loadManagers(); }, [dealer.id]);

    const handleCreate = async (e) => {
      e.preventDefault();
      setSubmitting(true);
      setError("");
      setMessage("");
      try {
        await api.post(`/admin/dealers/${dealer.id}/managers`, form);
        setForm({ name: "", email: "", phone: "", password: "", role: "DEALER_STOCK_INVENTORY_MANAGER" });
        setShowForm(false);
        setMessage("Dealer Manager added successfully!");
        await loadManagers();
        onRefresh?.();
      } catch (err) {
        setError(err.response?.data?.message || "Failed to add dealer manager");
      } finally {
        setSubmitting(false);
      }
    };

    const handleToggle = async (m) => {
      try {
        const nextStatus = m.status === "active" ? "inactive" : "active";
        await api.patch(`/admin/dealer-managers/${m.id}/status`, { status: nextStatus });
        await loadManagers();
      } catch (err) {
        alert("Failed to update status");
      }
    };

    const handleDelete = async (m) => {
      if (!confirm(`Delete manager ${m.name}?`)) return;
      try {
        await api.delete(`/admin/dealer-managers/${m.id}`);
        await loadManagers();
        onRefresh?.();
      } catch (err) {
        alert("Failed to delete manager");
      }
    };

    const roleLabels = {
      DEALER_STOCK_INVENTORY_MANAGER: "Inventory Manager",
      DEALER_STOCK_DELIVERY_MANAGER: "Delivery Manager",
      DEALER_SALES_FINANCE_MANAGER: "Sales & Finance Manager"
    };

    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
        <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Dealer Managers: {dealer.dealerName}</h2>
              <p className="mt-1 text-sm text-slate-500">Manage operational managers for this dealer (uses dealer licenses).</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          {message && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Current Managers ({managers.length})</p>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus size={14} /> {showForm ? "Cancel" : "Add Dealer Manager"}
            </Button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-4">
              <p className="font-bold text-slate-900 text-sm">Add New Dealer Manager</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <TextField label="Phone" type="tel" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} />
                <TextField label="Password" type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-600">Role
                    <select className="mt-1 w-full rounded-md border border-slate-200 p-2.5 bg-white" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      <option value="DEALER_STOCK_INVENTORY_MANAGER">Stock & Inventory Manager</option>
                      <option value="DEALER_STOCK_DELIVERY_MANAGER">Stock & Delivery Manager</option>
                      <option value="DEALER_SALES_FINANCE_MANAGER">Sales & Finance Manager</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add Manager"}</Button>
              </div>
            </form>
          )}

          <div className="mt-5">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-400">Loading managers...</div>
            ) : managers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                No dealer managers created yet for this dealer. Click "Add Dealer Manager" above to create one.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900">{m.name}</td>
                        <td className="p-3 text-slate-600">{m.email}</td>
                        <td className="p-3 text-slate-600">{m.phone || "-"}</td>
                        <td className="p-3 text-xs font-semibold text-indigo-700">{roleLabels[m.role] || m.role}</td>
                        <td className="p-3">
                          <button type="button" onClick={() => handleToggle(m)} title="Toggle status">
                            <StatusBadge value={m.status} />
                          </button>
                        </td>
                        <td className="p-3 text-right">
                          <button type="button" onClick={() => handleDelete(m)} className="rounded p-1.5 text-rose-500 hover:bg-rose-50" title="Delete manager">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    );
  }

  function AdminTeamChat({ chatTarget }) {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const commonChat = { id: "common", name: "Common Team Chat", role: "all_members" };
    const [selected, setSelected] = useState(commonChat);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [attachment, setAttachment] = useState(null);
    const [editingMsg, setEditingMsg] = useState(null);
    
    const loadMessages = () => { if (selected) api.get(`/admin-ceo/chat/${selected.id}`).then(({ data }) => setMessages(data)); };
    
    useEffect(() => { 
      api.get("/admin-ceo/chat/conversations").then(({ data }) => {
        const userList = [commonChat, ...data];
        setUsers(userList);
        if (chatTarget) {
          const target = userList.find(u => String(u.id) === String(chatTarget));
          if (target) setSelected(target);
        }
      }); 
    }, []);
    
    useEffect(() => {
      if (chatTarget && users.length) {
        const target = users.find(u => String(u.id) === String(chatTarget));
        if (target) setSelected(target);
      }
    }, [chatTarget]);

    useEffect(() => { loadMessages(); }, [selected]);

    const send = async (e) => {
      e.preventDefault();
      if (!selected || (!text.trim() && !attachment)) return;
      
      if (editingMsg) {
        await api.put(`/admin-ceo/chat/${editingMsg.id}`, { message: text.trim() });
        setEditingMsg(null);
      } else {
        const formData = new FormData();
        formData.append("receiverId", selected.id);
        if (text.trim()) formData.append("message", text.trim());
        if (attachment) formData.append("attachment", attachment);
        await api.post("/admin-ceo/chat/send", formData, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setText("");
      setAttachment(null);
      loadMessages();
    };

    const removeMsg = async (id) => {
      if (!window.confirm("Delete this message?")) return;
      await api.delete(`/admin-ceo/chat/${id}`);
      loadMessages();
    };
    
    const isImage = (url) => url && /\.(jpg|jpeg|png|gif|webp)$/i.test(url);

    return (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Section title="Team members">
          <div className="space-y-2">
            {users.map((u) => <button key={u.id} onClick={() => { setSelected(u); setEditingMsg(null); setText(""); setAttachment(null); }} className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${selected?.id === u.id ? "border-indigo-200 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-100 hover:bg-slate-50"}`}><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-bold text-white">{(u.name || "?").slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{u.name}</span><span className="block truncate text-xs text-slate-500">{u.role.replaceAll("_", " ")}</span></span></span></button>)}
          </div>
        </Section>
        <Section title={selected ? (selected.id === "common" ? "Common Team Chat" : `Internal team chat - ${selected.name}`) : "Internal team chat"}>
          {selected ? (
            <>
              <div className="mb-4 h-[28rem] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
                {messages.length ? messages.map((m) => {
                  const mine = Number(m.senderId) === Number(user?.id);
                  return (
                    <div key={m.id} className={`flex group ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`relative max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${mine ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
                        {mine && (
                          <div className="absolute -left-16 top-2 hidden group-hover:flex gap-1 bg-white p-1 rounded-md shadow-sm border border-slate-100">
                            <button onClick={() => { setEditingMsg(m); setText(m.message); setAttachment(null); }} className="text-slate-400 hover:text-indigo-600 p-1"><Pencil size={14} /></button>
                            <button onClick={() => removeMsg(m.id)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={14} /></button>
                          </div>
                        )}
                        <p className={`mb-1 text-xs font-bold ${mine ? "text-indigo-100" : "text-slate-500"}`}>{mine ? "You" : m.sender?.name || "Team member"}</p>
                        <p className="leading-6 whitespace-pre-wrap">{m.message}</p>
                        {m.attachmentUrl && (
                          <div className="mt-2">
                            {isImage(m.attachmentUrl) ? (
                              <a href={fileUrl(m.attachmentUrl)} target="_blank" rel="noreferrer"><img src={fileUrl(m.attachmentUrl)} alt={m.attachmentName} className="max-w-full rounded-lg shadow-sm border border-slate-200/50 max-h-48 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} /></a>
                            ) : (
                              <a href={fileUrl(m.attachmentUrl)} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium underline ${mine ? "bg-indigo-700 text-indigo-50" : "bg-slate-50 text-slate-700"}`}><Paperclip size={14} /> {m.attachmentName || "Attachment"}</a>
                            )}
                          </div>
                        )}
                        <div className={`mt-2 flex justify-between items-center text-[11px] ${mine ? "text-indigo-100" : "text-slate-400"}`}>
                          <span>{new Date(m.createdAt).toLocaleString()}</span>
                          {m.isEdited && <span className="italic ml-2">(edited)</span>}
                        </div>
                      </div>
                    </div>
                  );
                }) : <Empty text="No messages yet. Start the conversation." />}
              </div>
              <form onSubmit={send} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                {attachment && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-lg text-xs font-medium text-slate-700">
                    <Paperclip size={14} /> {attachment.name}
                    <button type="button" onClick={() => setAttachment(null)} className="ml-auto text-slate-400 hover:text-rose-500"><X size={14} /></button>
                  </div>
                )}
                {editingMsg && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-lg text-xs font-medium text-amber-700 border border-amber-100">
                    <span>Editing message</span>
                    <button type="button" onClick={() => { setEditingMsg(null); setText(""); }} className="ml-auto text-amber-500 hover:text-amber-700"><X size={14} /></button>
                  </div>
                )}
                <div className="flex gap-2">
                  <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition">
                    <Paperclip size={18} />
                    <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files[0])} disabled={!!editingMsg} />
                  </label>
                  <input className="flex-1 rounded-xl border-0 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 bg-slate-50" value={text} onChange={(e) => setText(e.target.value)} placeholder={editingMsg ? "Edit message..." : `Message ${selected.id === "common" ? "everyone" : selected.name}`} required={!attachment} />
                  <Button type="submit">{editingMsg ? "Save" : "Send"}</Button>
                </div>
              </form>
            </>
          ) : <Empty text="Select a team member to open chat" />}
        </Section>
      </div>
    );
  }

  function OrderTable({ rows, updateOrder, approveOrder, approvingOrderId, schedules, setSchedules, filter = "all", setFilter, page = 1, setPage }) {
    const setSchedule = (id, key, value) => setSchedules({ ...schedules, [id]: { ...(schedules[id] || {}), [key]: value } });
    const dealerTitle = (order) => `${order.Dealer?.dealerName || "Dealer"}${order.Dealer?.area || order.Dealer?.city ? ` - ${[order.Dealer?.area, order.Dealer?.city].filter(Boolean).join(", ")}` : ""}`;
    const pageSize = 10;
    const filtered = rows.filter((order) => filter === "all" || order.status === filter);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
    return (
      <Section title="Order & delivery management" actions={<div className="flex flex-wrap gap-2">{["all", "pending", "payment", "packing", "shipping", "out_for_delivery", "delivered", "rejected"].map((status) => <button key={status} onClick={() => { setFilter(status); setPage(1); }} className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === status ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{status.replaceAll("_", " ")}</button>)}</div>}>
        {visible.length ? (
          <>
            <div className="space-y-4">
              {visible.map((o) => {
                const schedule = schedules[o.id] || {};
                const ready = schedule.packingDate && schedule.shippingDate && schedule.outForDeliveryDate && schedule.deliveredDate;
                const isApproving = approvingOrderId === o.id;
                return (
                  <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <p className="font-bold text-slate-900 text-base">{dealerTitle(o)} · <span className="text-indigo-700 font-extrabold">{formatMoney(o.totalAmount)}</span></p>
                        <p className="mt-0.5 text-xs text-slate-500">Order Date: {new Date(o.createdAt).toLocaleDateString()} · Status: <span className="font-semibold capitalize">{o.status?.replaceAll("_", " ")}</span></p>
                        <p className="mt-0.5 text-xs text-slate-400 font-mono">Reference: #{o.orderNumber}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {o.status === "pending" ? (
                          <>
                            <Button disabled={!ready || isApproving} onClick={() => approveOrder(o.id)}>
                              {isApproving ? "Accepting..." : "Accept & Request Payment"}
                            </Button>
                            <Button variant="ghost" disabled={isApproving} onClick={() => updateOrder(o.id, "rejected")}>Reject</Button>
                          </>
                        ) : (
                          <StatusBadge value={o.status} />
                        )}
                      </div>
                    </div>
                    <OrderVisualItems items={o.items} />
                    {o.status === "pending" && (
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        {["packingDate", "shippingDate", "outForDeliveryDate", "deliveredDate"].map((key) => (
                          <TextField key={key} label={key.replace(/([A-Z])/g, " $1")} type="date" value={schedule[key] || ""} onChange={(e) => setSchedule(o.id, key, e.target.value)} />
                        ))}
                      </div>
                    )}
                    {o.status === "payment" && (
                      <div className="mt-4 rounded-md bg-purple-50 border border-purple-200 p-3 text-xs font-semibold text-purple-700">
                        Order Accepted. Payment request has been sent to Dealer Sales & Finance Manager. Once payment is completed by dealer and verified by Organization Finance Manager, order will automatically move to Packing.
                      </div>
                    )}
                    {o.status === "approved" && (
                      <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3 text-xs font-semibold text-green-700">
                        Approved. Invoice generated automatically. Continue delivery updates in Delivery.
                      </div>
                    )}
                    <div className="mt-4 grid gap-2 md:grid-cols-4">
                      {["packingDate", "shippingDate", "outForDeliveryDate", "deliveredDate"].map((key) => o[key] && (
                        <div key={key} className="rounded-md bg-slate-50 border border-slate-200/80 p-2 text-xs">
                          <span className="font-semibold text-slate-500">{key.replace(/([A-Z])/g, " $1")}:</span> <strong className="text-slate-800">{o[key]}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <PaginationControls page={safePage} setPage={setPage} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize} />
          </>
        ) : (
          <Empty text="No orders match this filter" />
        )}
      </Section>
    );
  }

  function FinanceTable({ rows = [], dealers = [], filter, setFilter, sendReminder, confirmPayment }) {
    const [methodFilter, setMethodFilter] = useState("all");
    const [dealerFilter, setDealerFilter] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const dealerName = (id) => dealers.find((d) => d.id === id)?.dealerName || `Dealer #${id}`;
    const pageSize = 10;
    const visible = rows.filter((payment) => {
      const statusMatch = filter === "all" || (
        filter === "unpaid" ? (payment.paymentStatus === "pending" || payment.paymentStatus === "under_review") :
        filter === "under_review" ? payment.paymentStatus === "under_review" :
        filter === "pending" ? payment.paymentStatus === "pending" :
        filter === "paid" ? payment.paymentStatus === "paid" :
        payment.paymentStatus === filter
      );
      const methodMatch = methodFilter === "all" || payment.paymentMethod === methodFilter;
      const dealerMatch = !dealerFilter || String(payment.dealerId) === String(dealerFilter);
      const haystack = `${payment.invoiceNumber || ""} ${payment.Order?.orderNumber || payment.orderNumber || ""} ${payment.Dealer?.dealerName || dealerName(payment.dealerId)} ${payment.Order?.items?.map(orderItemLabel).join(" ") || payment.productSummary || ""}`.toLowerCase();
      return statusMatch && methodMatch && dealerMatch && haystack.includes(search.toLowerCase());
    });
    const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageRows = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
    const resetPage = (fn) => (value) => { fn(value); setPage(1); };
    const actions = (
      <div className="flex flex-wrap gap-2">
        <input className="rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="Search invoice, dealer, SKU" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="rounded-md border border-slate-200 px-3 py-2 text-sm" value={dealerFilter} onChange={(e) => resetPage(setDealerFilter)(e.target.value)}>
          <option value="">All dealers</option>
          {dealers.map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.dealerName}</option>)}
        </select>
        <select className="rounded-md border border-slate-200 px-3 py-2 text-sm" value={methodFilter} onChange={(e) => resetPage(setMethodFilter)(e.target.value)}>
          <option value="all">All methods</option>
          <option value="cash">Cash</option>
          <option value="online">Online</option>
        </select>
      </div>
    );
    return (
      <>
        <Section title="Dealer-wise payment list" actions={actions}>
          <div className="mb-4 flex flex-wrap gap-2">{["all", "under_review", "pending", "paid"].map((tab) => <button key={tab} onClick={() => { setFilter(tab); setPage(1); }} className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === tab ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{tab.replaceAll("_", " ")}</button>)}</div>
          {pageRows.length ? <>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500"><tr>{["Dealer", "Invoice", "Amount", "Status", "Method", "Due / Paid", "Action"].map((h) => <th className="px-4 py-3" key={h}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{pageRows.map((payment) => (
                  <tr key={payment.id} className="align-top transition hover:bg-slate-50">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-900">{payment.Dealer?.dealerName || dealerName(payment.dealerId)}</p><p className="text-xs text-slate-500">{[payment.Dealer?.area, payment.Dealer?.city].filter(Boolean).join(", ") || "-"}</p></td>
                    <td className="px-4 py-3"><button type="button" onClick={() => setSelected(payment)} className="font-mono text-xs font-bold text-indigo-700 hover:underline">{payment.invoiceNumber || `INV-${payment.id}`}</button><p className="mt-1 text-xs text-slate-500">Order {payment.Order?.orderNumber || payment.orderNumber || payment.orderId}</p></td>
                    <td className="px-4 py-3 font-bold text-slate-950">{formatMoney(payment.amount)}</td>
                    <td className="px-4 py-3"><PaymentBadge value={payment.paymentStatus} /></td>
                    <td className="px-4 py-3"><PaymentBadge value={payment.paymentMethod || "not selected"} /></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{payment.paymentStatus === "paid" ? (payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : "Paid") : `${payment.daysUnpaid || 0} days unpaid`}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button className="min-h-9 px-3 py-1.5 text-xs" variant="soft" onClick={() => setSelected(payment)}>View invoice</Button>
                        {payment.paymentStatus === "under_review" && confirmPayment && (
                          <Button className="min-h-9 px-3 py-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 border-none font-bold shadow-sm" onClick={() => confirmPayment(payment.id)}>
                            Payment Confirmed
                          </Button>
                        )}
                        {payment.paymentStatus === "pending" && (
                          <>
                            <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700">
                              Waiting for Dealer Payment
                            </span>
                            <Button className="min-h-9 px-3 py-1.5 text-xs" variant="ghost" onClick={() => sendReminder(payment.id)}>Reminder</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <PaginationControls page={safePage} setPage={setPage} totalPages={totalPages} totalItems={visible.length} pageSize={pageSize} />
          </> : <Empty text="No payment invoices match these filters" />}
        </Section>
        {selected && <InvoiceDetailsModal payment={selected} dealerName={dealerName} sendReminder={sendReminder} confirmPayment={confirmPayment} onClose={() => setSelected(null)} />}
      </>
    );
  }

  function InvoiceDetailsModal({ payment, dealerName, sendReminder, confirmPayment, onClose }) {
    const items = payment.Order?.items || [];
    const detailRows = [
      ["Invoice", payment.invoiceNumber || `INV-${payment.id}`],
      ["Dealer", payment.Dealer?.dealerName || dealerName(payment.dealerId)],
      ["Order", payment.Order?.orderNumber || payment.orderNumber || payment.orderId],
      ["Amount", formatMoney(payment.amount)],
      ["Payment Status", payment.paymentStatus],
      ["Payment Method", payment.paymentMethod || "-"],
      ["Approved", payment.orderApprovedAt ? new Date(payment.orderApprovedAt).toLocaleString() : "-"],
      ["Days Unpaid", payment.daysUnpaid || 0],
      ["Paid At", payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "-"],
      ["Transaction", payment.transactionId || "-"]
    ];
    return (
      <ProductModalShell title={`Invoice ${payment.invoiceNumber || `INV-${payment.id}`}`} onClose={onClose} footer={<>{payment.invoiceFile && <a className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-indigo-700" href={fileUrl(payment.invoiceFile)} target="_blank">Open invoice file</a>}{payment.paymentStatus === "under_review" && confirmPayment && <Button className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold" onClick={() => { confirmPayment(payment.id); onClose(); }}>Payment Confirmed</Button>}{payment.paymentStatus === "pending" && <span className="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">Dealer has not submitted payment mode yet</span>}{payment.paymentStatus === "pending" && <Button variant="ghost" onClick={() => sendReminder(payment.id)}>Send Reminder</Button>}<Button onClick={onClose}>Close</Button></>}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {detailRows.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words font-semibold text-slate-950">{value}</p></div>)}
        </div>
        <div className="mt-5 rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-900">Products in this invoice</div>
          {items.length ? <div className="divide-y divide-slate-100">{items.map((item) => {
            const variant = item.ProductVariant || item;
            return (
              <div key={item.id || `${item.productId}-${item.productVariantId}`} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_auto_auto]">
                <div>
                  <p className="font-bold text-slate-950">{item.Product?.productName || "Product"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <CompactSku value={fullVariantSku(item.Product || {}, variant)} />
                    <span className="text-xs text-slate-500 font-medium">
                      Variant: {item.variantName ? `${item.variantName} / ${item.colorName || "-"}` : "Standard"} {item.Product?.category ? `| ${item.Product.category}` : ""}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-700">Quantity: {item.quantity}</div>
                <div className="rounded-lg bg-indigo-50 px-3 py-2 font-semibold text-indigo-700">{formatMoney(item.lineTotal || item.total || Number(item.price || item.unitPrice || 0) * Number(item.quantity || 0))}</div>
              </div>
            );
          })}</div> : <div className="p-4 text-sm text-slate-600">{payment.productSummary || "No product details available for this invoice."}</div>}
        </div>
      </ProductModalShell>
    );
  }

  function AdminChat({ data = {}, form, setForm, sendMessage }) {
    const dealers = data.dealers || [];
    const messages = data.messages || [];
    const messagesEndRef = useRef(null);

    // Sort dealers with the latest message at the top so newest chat is first
    const sortedDealers = useMemo(() => {
      const getLatestTime = (dealerId) => {
        const dealerMsgs = messages.filter((m) => String(m.dealerId) === String(dealerId));
        if (!dealerMsgs.length) return 0;
        return new Date(dealerMsgs[dealerMsgs.length - 1].createdAt || 0).getTime();
      };
      return [...dealers].sort((a, b) => getLatestTime(b.id) - getLatestTime(a.id));
    }, [dealers, messages]);

    // Newest chat should open first: auto-select the dealer with the latest message on initial open
    useEffect(() => {
      if (form.dealerId === "" && sortedDealers.length > 0) {
        const hasAnyDealerMsg = messages.some((m) => m.dealerId);
        if (hasAnyDealerMsg && sortedDealers[0]) {
          setForm((prev) => ({ ...prev, dealerId: String(sortedDealers[0].id) }));
        }
      }
    }, [sortedDealers, form.dealerId]);

    const selected = form.dealerId || "";
    const visible = useMemo(() => {
      return messages.filter((m) => selected ? String(m.dealerId) === String(selected) : (m.conversationId?.endsWith("-all") || !m.dealerId));
    }, [messages, selected]);

    // Auto-scroll chat window to bottom on new message
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [visible.length]);

    return (
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Section title="Dealers">
          <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1">
            <button
              type="button"
              onClick={() => setForm({ ...form, dealerId: "" })}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${selected === "" ? "bg-cyan-50 font-bold text-brand" : "hover:bg-slate-50 text-slate-700"}`}
            >
              All Dealers (Broadcast)
            </button>
            {sortedDealers.map((d) => {
              const dMsgs = messages.filter((m) => m.dealerId === d.id);
              const latest = dMsgs.at(-1);
              const isSelected = String(selected) === String(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setForm({ ...form, dealerId: String(d.id) })}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${isSelected ? "bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold" : "hover:bg-slate-50 text-slate-700"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="block font-semibold truncate">{d.dealerName}</span>
                    {latest?.createdAt && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(latest.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {latest?.message || "No messages yet"}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
        <Section title="Chat window">
          <div className="mb-4 h-96 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-4 border border-slate-200/80">
            {visible.length ? (
              visible.map((m) => {
                const isMine = m.sender?.role === "ADMIN" || m.sender?.role === "ADMIN_CEO" || m.title === "Message";
                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-xs break-words break-all whitespace-pre-wrap overflow-hidden ${isMine ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-900"}`}>
                      <p className="break-words break-all whitespace-pre-wrap overflow-hidden leading-relaxed">{m.message}</p>
                      {m.messageType === "stock_request" && (
                        <p className="mt-1.5 rounded-md bg-black/10 px-2 py-1 text-[11px] font-medium">
                          Stock Request: Requested {m.requestedQuantity}, available stock: {m.availableStock}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] opacity-75 text-right">
                        {new Date(m.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty text="No messages in this conversation" />
            )}
            <div ref={messagesEndRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.message?.trim()) return;
              sendMessage({ ...form, dealerId: form.dealerId || null, title: "Message" });
            }}
            className="flex gap-2"
          >
            <input
              className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-cyan-100"
              value={form.message || ""}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Type a message..."
              required
            />
            <Button type="submit">Send</Button>
          </form>
        </Section>
      </div>
    );
  }

  function Composer({ title, form, setForm, submit, rows, cols }) {
    return <><Section title={title}><FormGrid onSubmit={(e) => { e.preventDefault(); submit(); }}>{Object.keys(form).map((k) => <TextField key={k} label={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />)}<div className="md:col-span-2"><Button type="submit">Save</Button></div></FormGrid></Section><SimpleTable title={`${title} list`} rows={rows} cols={cols} /></>;
  }



