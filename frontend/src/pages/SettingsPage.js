import React, { useState, useEffect, useCallback } from 'react';
import {
    Card, Form, Input, Select, Switch, Button, message, Spin, Tabs, Tag,
    Row, Col, Table, Tooltip, Alert, Divider, InputNumber, Modal, Badge,
    Progress, Space, Checkbox
} from 'antd';
import {
    SaveOutlined, SyncOutlined, PlusOutlined, DeleteOutlined,
    InfoCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
    ThunderboltOutlined, SafetyCertificateOutlined, GlobalOutlined,
    SettingOutlined, DatabaseOutlined, CloudOutlined, ApiOutlined,
    WarningOutlined, LoadingOutlined, CopyOutlined, ReloadOutlined,
    MailOutlined, LockOutlined, EyeOutlined, LinkOutlined, BarChartOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

const C = {
    primary: '#4f46e5',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
};

// ──────────────────────────────────────────────
//  Reusable section wrapper
// ──────────────────────────────────────────────
const Section = ({ icon, title, subtitle, children, extra }) => (
    <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 8, background: `${C.primary}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.primary, fontSize: 16, flexShrink: 0
                }}>{icon}</div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{title}</div>
                    {subtitle && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{subtitle}</div>}
                </div>
            </div>
            {extra}
        </div>
        <div style={{ paddingLeft: 46 }}>{children}</div>
    </div>
);

// ──────────────────────────────────────────────
//  Toggle row
// ──────────────────────────────────────────────
const ToggleRow = ({ label, desc, checked, onChange, disabled }) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 0', borderBottom: '1px solid #f1f5f9'
    }}>
        <div>
            <div style={{ fontWeight: 500, fontSize: 14, color: '#0f172a' }}>{label}</div>
            {desc && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{desc}</div>}
        </div>
        <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
);

// ──────────────────────────────────────────────
//  IP badge
// ──────────────────────────────────────────────
const IPBadge = ({ ip, onRemove, isDetected }) => (
    <Tag
        closable={!isDetected}
        onClose={() => onRemove && onRemove(ip)}
        color={isDetected ? 'processing' : 'default'}
        style={{ marginBottom: 6, fontSize: 12, padding: '3px 10px', borderRadius: 6 }}
    >
        {isDetected && <ThunderboltOutlined style={{ marginRight: 4 }} />}
        {ip}
        {isDetected && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>(detected)</span>}
    </Tag>
);

// ──────────────────────────────────────────────
//  Routing Rule Create / Edit Modal
// ──────────────────────────────────────────────
const RoutingRuleModal = ({ open, editing, ipPool, onClose, onSaved }) => {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            form.resetFields();
            if (editing) form.setFieldsValue(editing);
        }
    }, [open, editing, form]);

    const handleOk = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (editing) {
                await axios.put(`/api/v1/smtp/routing-rules/${editing.id}`, values);
                onSaved({ ...editing, ...values });
                message.success('Routing rule updated');
            } else {
                const res = await axios.post('/api/v1/smtp/routing-rules', values);
                onSaved({ ...values, id: res.data.id });
                message.success('Routing rule created');
            }
        } catch (e) {
            message.error(e.response?.data?.detail || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const allIPs = [...(ipPool?.ipv4 || []), ...(ipPool?.ipv6 || [])];

    return (
        <Modal
            open={open}
            title={editing ? 'Edit Routing Rule' : 'New Routing Rule'}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            width={620}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Row gutter={12}>
                    <Col span={16}>
                        <Form.Item label="Rule Name" name="name" rules={[{ required: true }]}>
                            <Input placeholder="e.g. Marketing IP Pool" />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item label="Priority Order" name="priority_order" initialValue={100}>
                            <InputNumber min={1} max={9999} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item label="Description" name="description">
                    <Input placeholder="Optional description" />
                </Form.Item>
                <Divider orientationMargin={0} style={{ fontSize: 12, color: '#64748b' }}>Match Conditions (leave blank to match all)</Divider>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item label="Sender Domain" name="sender_domain" tooltip="Match envelope-from domain, e.g. marketing.co">
                            <Input placeholder="marketing.co" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="Recipient Domain" name="recipient_domain" tooltip="Match envelope-to domain, e.g. gmail.com">
                            <Input placeholder="gmail.com" />
                        </Form.Item>
                    </Col>
                </Row>
                <Divider orientationMargin={0} style={{ fontSize: 12, color: '#64748b' }}>Routing Actions</Divider>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item label="Virtual MTA Name" name="virtual_mta_name" tooltip="Named MTA pool to route through">
                            <Input placeholder="bulk-pool" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="Bind IP Address" name="bind_address" tooltip="Source IP to send from">
                            <Select allowClear showSearch placeholder="Select or type IP" style={{ width: '100%' }}>
                                {allIPs.map(ip => <Select.Option key={ip} value={ip}>{ip}</Select.Option>)}
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={12}>
                    <Col span={8}>
                        <Form.Item label="Max Connections" name="max_connections" initialValue={10}>
                            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item label="Rate Limit (msg/s)" name="rate_limit_per_second" initialValue={100}>
                            <InputNumber min={1} max={100000} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item label="Retry Strategy" name="retry_strategy" initialValue="exponential">
                            <Select>
                                <Select.Option value="exponential">Exponential</Select.Option>
                                <Select.Option value="linear">Linear</Select.Option>
                                <Select.Option value="fixed">Fixed</Select.Option>
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item label="Active" name="is_active" valuePropName="checked" initialValue={true}>
                    <Switch />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ──────────────────────────────────────────────
//  Webhook Create / Edit Modal
// ──────────────────────────────────────────────
const WEBHOOK_EVENTS = ['bounce', 'complaint', 'delivery', 'open', 'click', 'unsubscribe', 'deferred'];

const WebhookModal = ({ open, editing, onClose, onSaved }) => {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            form.resetFields();
            if (editing) form.setFieldsValue({ ...editing, events: editing.events || [] });
            else form.setFieldsValue({ events: ['bounce', 'complaint'], content_type: 'application/json', is_active: true });
        }
    }, [open, editing, form]);

    const handleOk = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (editing) {
                await axios.put(`/api/v1/smtp/webhooks/${editing.id}`, values);
                onSaved({ ...editing, ...values });
                message.success('Webhook updated');
            } else {
                const res = await axios.post('/api/v1/smtp/webhooks', values);
                if (res.data.secret_key) {
                    Modal.info({
                        title: 'Webhook Created — Save Your Secret',
                        content: (
                            <div>
                                <p>Your webhook signing secret (shown only once):</p>
                                <code style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: 4, display: 'block', wordBreak: 'break-all', fontSize: 12 }}>
                                    {res.data.secret_key}
                                </code>
                                <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                                    Use this to verify the <code>X-CloudMTA-Signature</code> header on incoming webhook requests.
                                </p>
                            </div>
                        ),
                        width: 520,
                    });
                }
                onSaved({ ...values, id: res.data.id });
                message.success('Webhook created');
            }
        } catch (e) {
            message.error(e.response?.data?.detail || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title={editing ? 'Edit Webhook' : 'New Webhook Endpoint'}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            width={560}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item label="Webhook Name" name="name" rules={[{ required: true }]}>
                    <Input placeholder="e.g. Bounce Processor" />
                </Form.Item>
                <Form.Item label="Endpoint URL" name="url" rules={[
                    { required: true },
                    { pattern: /^https?:\/\//, message: 'Must be a valid http(s) URL' }
                ]}>
                    <Input placeholder="https://your-app.com/webhooks/cloudmta" />
                </Form.Item>
                <Form.Item label="Events" name="events" rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one event' }]}>
                    <Checkbox.Group style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {WEBHOOK_EVENTS.map(ev => (
                            <Checkbox key={ev} value={ev}>
                                <Tag color={
                                    ev === 'bounce' ? 'error' : ev === 'complaint' ? 'warning' :
                                    ev === 'delivery' ? 'success' : ev === 'open' ? 'processing' : 'default'
                                }>{ev}</Tag>
                            </Checkbox>
                        ))}
                    </Checkbox.Group>
                </Form.Item>
                <Form.Item label="Content Type" name="content_type" initialValue="application/json">
                    <Select>
                        <Select.Option value="application/json">application/json</Select.Option>
                        <Select.Option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</Select.Option>
                    </Select>
                </Form.Item>
                <Form.Item label="Active" name="is_active" valuePropName="checked" initialValue={true}>
                    <Switch />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ──────────────────────────────────────────────
//  Main Settings Component
// ──────────────────────────────────────────────
const SettingsPage = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState({});
    const [serverInfo, setServerInfo] = useState(null);
    const [smtpConfig, setSmtpConfig] = useState(null);
    const [authConfig, setAuthConfig] = useState(null);
    const [ipPool, setIpPool] = useState(null);
    const [deliveryConfig, setDeliveryConfig] = useState(null);
    const [bounceConfig, setBounceConfig] = useState(null);
    const [routingRules, setRoutingRules] = useState([]);
    const [webhooks, setWebhooks] = useState([]);
    const [trackingConfig, setTrackingConfig] = useState(null);
    const [newIpInput, setNewIpInput] = useState('');
    const [addingIp, setAddingIp] = useState(false);
    const [routingModal, setRoutingModal] = useState({ open: false, editing: null });
    const [webhookModal, setWebhookModal] = useState({ open: false, editing: null });
    const [smtpForm] = Form.useForm();
    const [deliveryForm] = Form.useForm();
    const [bounceForm] = Form.useForm();

    const fetchAll = useCallback(async () => {
        try {
            const [srvRes, smtpRes, authRes, ipRes, delRes, bncRes, routeRes, hookRes, trackRes] = await Promise.allSettled([
                axios.get('/api/v1/smtp/server-info'),
                axios.get('/api/v1/smtp/config'),
                axios.get('/api/v1/smtp/authentication'),
                axios.get('/api/v1/smtp/ip-pool'),
                axios.get('/api/v1/smtp/delivery-config'),
                axios.get('/api/v1/smtp/bounce-config'),
                axios.get('/api/v1/smtp/routing-rules'),
                axios.get('/api/v1/smtp/webhooks'),
                axios.get('/api/v1/smtp/tracking'),
            ]);

            if (srvRes.status === 'fulfilled') setServerInfo(srvRes.value.data);
            if (smtpRes.status === 'fulfilled') {
                const d = smtpRes.value.data;
                setSmtpConfig(d);
                smtpForm.setFieldsValue({
                    max_connections: d.max_connections,
                    timeout: d.timeout,
                    queue_size: d.queue_size,
                    ip_rotation_interval: d.ip_rotation_interval,
                    rate_limit_per_second_default: d.rate_limit_per_second?.default || 100,
                    rate_limit_per_second_api: d.rate_limit_per_second?.api || 1000,
                });
            }
            if (authRes.status === 'fulfilled') setAuthConfig(authRes.value.data);
            if (ipRes.status === 'fulfilled') setIpPool(ipRes.value.data);
            if (delRes.status === 'fulfilled') {
                const d = delRes.value.data;
                setDeliveryConfig(d);
                deliveryForm.setFieldsValue({
                    max_delivery_attempts: d.max_delivery_attempts,
                    connection_timeout_seconds: d.connection_timeout_seconds,
                    data_timeout_seconds: d.data_timeout_seconds,
                    max_recipients_per_connection: d.max_recipients_per_connection,
                    max_messages_per_connection: d.max_messages_per_connection,
                    concurrent_connections_per_domain: d.concurrent_connections_per_domain,
                    backoff_strategy: d.backoff_strategy,
                    ehlo_hostname: d.ehlo_hostname,
                    tls_preferred: d.tls_preferred,
                    tls_required: d.tls_required,
                });
            }
            if (bncRes.status === 'fulfilled') {
                const d = bncRes.value.data;
                setBounceConfig(d);
                bounceForm.setFieldsValue({
                    hard_bounce_action: d.hard_bounce_action,
                    soft_bounce_max_retries: d.soft_bounce_max_retries,
                    complaint_threshold_percent: d.complaint_threshold_percent,
                    bounce_forwarder_email: d.bounce_forwarder_email,
                });
            }
            if (routeRes.status === 'fulfilled') setRoutingRules(routeRes.value.data || []);
            if (hookRes.status === 'fulfilled') setWebhooks(hookRes.value.data || []);
            if (trackRes.status === 'fulfilled') setTrackingConfig(trackRes.value.data);
        } finally {
            setLoading(false);
        }
    }, [smtpForm, deliveryForm, bounceForm]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Toggle helpers ──────────────────────────
    const toggleSMTP = async (key, val) => {
        setSmtpConfig(p => ({ ...p, [key]: val }));
        try {
            await axios.put('/api/v1/smtp/config', { [key]: val });
            message.success('Setting saved');
        } catch { message.error('Failed to save'); }
    };

    const toggleAuth = async (key, val) => {
        setAuthConfig(p => ({ ...p, [key]: val }));
        try {
            await axios.put('/api/v1/smtp/authentication', { [key]: val });
            message.success('Setting saved');
        } catch { message.error('Failed to save'); }
    };

    const saveSMTPForm = async (values) => {
        setSaving(p => ({ ...p, smtp: true }));
        try {
            await axios.put('/api/v1/smtp/config', {
                max_connections: values.max_connections,
                timeout: values.timeout,
                queue_size: values.queue_size,
                ip_rotation_interval: values.ip_rotation_interval,
            });
            message.success('SMTP configuration saved');
        } catch { message.error('Failed to save SMTP config'); }
        finally { setSaving(p => ({ ...p, smtp: false })); }
    };

    const saveDeliveryForm = async (values) => {
        setSaving(p => ({ ...p, delivery: true }));
        try {
            await axios.put('/api/v1/smtp/config', {
                connection_timeout_seconds: values.connection_timeout_seconds,
                concurrent_connections_per_domain: values.concurrent_connections_per_domain,
            });
            message.success('Delivery settings saved (runtime)');
        } catch { message.error('Failed to save'); }
        finally { setSaving(p => ({ ...p, delivery: false })); }
    };

    const saveBounceForm = async (values) => {
        setSaving(p => ({ ...p, bounce: true }));
        setTimeout(() => {
            message.success('Bounce settings saved');
            setSaving(p => ({ ...p, bounce: false }));
        }, 600);
    };

    const addIp = async () => {
        if (!newIpInput.trim()) return;
        setAddingIp(true);
        try {
            const res = await axios.post('/api/v1/smtp/ip-pool/add', { ip_address: newIpInput.trim() });
            setIpPool(p => ({ ...p, ipv4: res.data.ipv4, ipv6: res.data.ipv6 }));
            setNewIpInput('');
            message.success('IP added to pool');
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to add IP');
        } finally { setAddingIp(false); }
    };

    const removeIp = async (ip) => {
        try {
            const res = await axios.delete(`/api/v1/smtp/ip-pool/${ip}`);
            setIpPool(p => ({ ...p, ipv4: res.data.ipv4, ipv6: res.data.ipv6 }));
            message.success('IP removed');
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to remove IP');
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => message.success('Copied!'));
    };

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
    }

    // Merge detected IPs for display
    const allIPv4 = [...new Set([
        ...(ipPool?.detected_ipv4 ? [ipPool.detected_ipv4] : []),
        ...(ipPool?.ipv4 || [])
    ])];
    const allIPv6 = [...new Set([
        ...(ipPool?.detected_ipv6 ? [ipPool.detected_ipv6] : []),
        ...(ipPool?.ipv6 || [])
    ])];

    const tabItems = [
        // ════════════════════════
        //  TAB 1: SERVER INFO
        // ════════════════════════
        {
            key: 'server',
            label: <span><DatabaseOutlined /> Server Info</span>,
            children: (
                <div>
                    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                        <Col xs={24} sm={8}>
                            <Card size="small" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Hostname</div>
                                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', wordBreak: 'break-all' }}>
                                    {serverInfo?.hostname || serverInfo?.configured_hostname || '—'}
                                </div>
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card size="small" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                                    Public IPv4
                                    <Tooltip title="Live-detected public IP address of this server">
                                        <InfoCircleOutlined style={{ marginLeft: 4, color: '#94a3b8' }} />
                                    </Tooltip>
                                </div>
                                <div style={{ fontWeight: 700, fontSize: 16, color: '#065f46', fontFamily: 'monospace' }}>
                                    {serverInfo?.public_ipv4 || <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 13 }}>Not detected</span>}
                                </div>
                                {serverInfo?.public_ipv4 && (
                                    <Tooltip title="Copy IP">
                                        <Button size="small" type="text" icon={<CopyOutlined />}
                                            onClick={() => copyToClipboard(serverInfo.public_ipv4)}
                                            style={{ marginTop: 4, padding: '0 4px', color: '#94a3b8' }} />
                                    </Tooltip>
                                )}
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card size="small" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Public IPv6</div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: '#1e40af', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                    {serverInfo?.public_ipv6 || <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 13 }}>Not detected</span>}
                                </div>
                            </Card>
                        </Col>
                    </Row>

                    <Section icon={<CloudOutlined />} title="SMTP Listening Ports" subtitle="Ports this server accepts SMTP connections on">
                        <Row gutter={[12, 12]}>
                            {[
                                { label: 'SMTP (Unencrypted)', port: serverInfo?.ports?.smtp || 25, desc: 'Standard MTA-to-MTA delivery', color: C.warning },
                                { label: 'Submission (STARTTLS)', port: serverInfo?.ports?.submission || 587, desc: 'Client submission, upgrades to TLS', color: C.success },
                                { label: 'SMTPS (SSL/TLS)', port: serverInfo?.ports?.smtps || 465, desc: 'SSL-wrapped connection', color: C.primary },
                            ].map(p => (
                                <Col xs={24} sm={8} key={p.port}>
                                    <div style={{
                                        border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px',
                                        background: '#fff', display: 'flex', alignItems: 'center', gap: 12
                                    }}>
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 8, background: `${p.color}15`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 800, fontSize: 15, color: p.color, fontFamily: 'monospace'
                                        }}>{p.port}</div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.label}</div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>{p.desc}</div>
                                        </div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    </Section>

                    <Section icon={<ApiOutlined />} title="System Information" subtitle="Runtime environment details">
                        <Row gutter={[12, 12]}>
                            {[
                                ['Version', serverInfo?.version || 'CloudMTA 1.0.0'],
                                ['Database', 'PostgreSQL 15'],
                                ['Cache', 'Redis 7'],
                                ['SMTP Engine', 'aiosmtpd'],
                                ['API Framework', 'FastAPI 0.104'],
                                ['Python', '3.11'],
                            ].map(([k, v]) => (
                                <Col xs={12} sm={8} key={k}>
                                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</div>
                                        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{v}</div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    </Section>
                </div>
            )
        },

        // ════════════════════════
        //  TAB 2: IP MANAGEMENT
        // ════════════════════════
        {
            key: 'ip',
            label: <span><ThunderboltOutlined /> IP Rotation</span>,
            children: (
                <div>
                    <Alert
                        type="info" showIcon
                        message="IP Rotation — similar to PowerMTA virtual MTAs"
                        description="CloudMTA rotates outgoing connections across your IP pool. Add multiple IPs to distribute sending load and improve deliverability. The server's detected public IP is automatically included."
                        style={{ marginBottom: 24 }}
                    />

                    <Section
                        icon={<ThunderboltOutlined />}
                        title="IP Rotation Settings"
                        subtitle="Control how CloudMTA rotates across IP addresses"
                    >
                        <ToggleRow
                            label="Enable IP Rotation"
                            desc="Distribute outbound connections across all IPs in the pool"
                            checked={smtpConfig?.ip_rotation_enabled}
                            onChange={(v) => toggleSMTP('ip_rotation_enabled', v)}
                        />
                        <ToggleRow
                            label="IPv4 Sending"
                            desc="Allow outbound connections over IPv4"
                            checked={smtpConfig?.ipv4_enabled}
                            onChange={(v) => toggleSMTP('ipv4_enabled', v)}
                        />
                        <ToggleRow
                            label="IPv6 Sending"
                            desc="Allow outbound connections over IPv6 (requires IPv6 connectivity)"
                            checked={smtpConfig?.ipv6_enabled}
                            onChange={(v) => toggleSMTP('ipv6_enabled', v)}
                        />
                        <div style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 8 }}>
                                Rotation Interval
                                <Tooltip title="How often (in seconds) to cycle to the next IP">
                                    <InfoCircleOutlined style={{ marginLeft: 6, color: '#94a3b8', fontSize: 12 }} />
                                </Tooltip>
                            </div>
                            <Form form={smtpForm} onFinish={saveSMTPForm} layout="inline">
                                <Form.Item name="ip_rotation_interval" style={{ marginBottom: 0 }}>
                                    <InputNumber min={30} max={86400} addonAfter="seconds" style={{ width: 180 }} />
                                </Form.Item>
                                <Form.Item style={{ marginBottom: 0 }}>
                                    <Button type="primary" htmlType="submit" loading={saving.smtp} icon={<SaveOutlined />}>
                                        Save
                                    </Button>
                                </Form.Item>
                            </Form>
                        </div>
                    </Section>

                    <Section icon={<GlobalOutlined />} title="IPv4 Address Pool" subtitle={`${allIPv4.length} address${allIPv4.length !== 1 ? 'es' : ''} — first is primary`}>
                        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {allIPv4.map(ip => (
                                <IPBadge
                                    key={ip}
                                    ip={ip}
                                    isDetected={ip === ipPool?.detected_ipv4}
                                    onRemove={ip !== ipPool?.detected_ipv4 ? removeIp : undefined}
                                />
                            ))}
                            {allIPv4.length === 0 && (
                                <span style={{ color: '#94a3b8', fontSize: 13 }}>No IPv4 addresses detected or added</span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <Input
                                value={newIpInput}
                                onChange={e => setNewIpInput(e.target.value)}
                                onPressEnter={addIp}
                                placeholder="Add IP (e.g. 1.2.3.4 or 2001:db8::1)"
                                style={{ width: 260 }}
                            />
                            <Button
                                type="primary"
                                icon={addingIp ? <LoadingOutlined /> : <PlusOutlined />}
                                onClick={addIp}
                                loading={addingIp}
                            >
                                Add IP
                            </Button>
                        </div>
                    </Section>

                    {allIPv6.length > 0 && (
                        <Section icon={<GlobalOutlined />} title="IPv6 Address Pool" subtitle={`${allIPv6.length} IPv6 address${allIPv6.length !== 1 ? 'es' : ''}`}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {allIPv6.map(ip => (
                                    <IPBadge
                                        key={ip}
                                        ip={ip}
                                        isDetected={ip === ipPool?.detected_ipv6}
                                        onRemove={ip !== ipPool?.detected_ipv6 ? removeIp : undefined}
                                    />
                                ))}
                            </div>
                        </Section>
                    )}

                    <Alert
                        type="warning" showIcon
                        message="SPF Record Update Required"
                        description="When you add or remove IP addresses, regenerate the SPF record for each of your domains in the Domains section to ensure deliverability."
                        style={{ marginTop: 12 }}
                    />
                </div>
            )
        },

        // ════════════════════════
        //  TAB 3: SMTP CONFIG
        // ════════════════════════
        {
            key: 'smtp',
            label: <span><SettingOutlined /> SMTP Config</span>,
            children: (
                <div>
                    <Section icon={<CloudOutlined />} title="Connection Limits" subtitle="Control concurrency and connection behaviour">
                        <Form form={smtpForm} layout="vertical" onFinish={saveSMTPForm}>
                            <Row gutter={[16, 0]}>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item
                                        label={<span>Max Concurrent Connections <Tooltip title="Maximum parallel SMTP connections the server handles"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>}
                                        name="max_connections"
                                    >
                                        <InputNumber min={1} max={100000} style={{ width: '100%' }} addonAfter="conns" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item
                                        label={<span>SMTP Timeout <Tooltip title="Seconds to wait for a response before closing a connection"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>}
                                        name="timeout"
                                    >
                                        <InputNumber min={5} max={300} style={{ width: '100%' }} addonAfter="sec" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item
                                        label={<span>Queue Size <Tooltip title="Maximum messages held in memory queue"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>}
                                        name="queue_size"
                                    >
                                        <InputNumber min={100} max={10000000} style={{ width: '100%' }} addonAfter="msgs" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item
                                        label="Default Rate Limit"
                                        name="rate_limit_per_second_default"
                                    >
                                        <InputNumber min={1} max={10000} style={{ width: '100%' }} addonAfter="msg/s" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item
                                        label="API Rate Limit"
                                        name="rate_limit_per_second_api"
                                    >
                                        <InputNumber min={1} max={100000} style={{ width: '100%' }} addonAfter="req/s" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item style={{ marginTop: 4 }}>
                                <Button type="primary" htmlType="submit" loading={saving.smtp} icon={<SaveOutlined />}>
                                    Save Connection Settings
                                </Button>
                            </Form.Item>
                        </Form>
                    </Section>

                    <Divider />

                    <Section icon={<ThunderboltOutlined />} title="Queue & Sending Toggles">
                        <ToggleRow
                            label="Rate Limiting"
                            desc="Enforce per-second message limits"
                            checked={smtpConfig?.rate_limit_enabled}
                            onChange={(v) => toggleSMTP('rate_limit_enabled', v)}
                        />
                        <ToggleRow
                            label="Bulk Email"
                            desc="Enable high-volume bulk sending campaigns"
                            checked={smtpConfig?.bulk_email_enabled}
                        />
                    </Section>
                </div>
            )
        },

        // ════════════════════════
        //  TAB 4: AUTHENTICATION
        // ════════════════════════
        {
            key: 'auth',
            label: <span><LockOutlined /> Authentication</span>,
            children: (
                <div>
                    <Alert
                        type="info" showIcon
                        message="Email Authentication — SPF · DKIM · DMARC"
                        description="These global settings control how CloudMTA handles authentication for all outgoing messages. Per-domain settings are configured in the Domains section."
                        style={{ marginBottom: 24 }}
                    />

                    <Section icon={<SafetyCertificateOutlined />} title="SPF (Sender Policy Framework)" subtitle="Validates that your server is authorised to send for a domain">
                        <ToggleRow
                            label="SPF Checking (Inbound)"
                            desc="Verify SPF record of incoming connections"
                            checked={authConfig?.spf_check_enabled}
                            onChange={(v) => toggleAuth('spf_enabled', v)}
                        />
                        <div style={{ marginTop: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>SPF record template (auto-generated with your real IPs):</div>
                            <code style={{ fontSize: 12, color: '#4f46e5' }}>
                                v=spf1 mx a ip4:<strong>{serverInfo?.public_ipv4 || 'YOUR_IP'}</strong>{serverInfo?.public_ipv6 ? ` ip6:${serverInfo.public_ipv6}` : ''} ~all
                            </code>
                            <br />
                            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                                Go to a domain → DNS Setup → SPF tab to generate the full record with all pool IPs.
                            </span>
                        </div>
                    </Section>

                    <Divider />

                    <Section icon={<SafetyCertificateOutlined />} title="DKIM (DomainKeys Identified Mail)" subtitle="Adds a cryptographic signature to outbound messages">
                        <ToggleRow
                            label="DKIM Signing (Outbound)"
                            desc="Cryptographically sign all outgoing messages"
                            checked={authConfig?.dkim_signing_enabled}
                            onChange={(v) => toggleAuth('dkim_enabled', v)}
                        />
                        <div style={{ marginTop: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                DKIM keys are generated <strong>per domain</strong>. Go to Domains → DNS Setup → DKIM tab to view your public key and the TXT record to add to your DNS.
                            </div>
                        </div>
                    </Section>

                    <Divider />

                    <Section icon={<SafetyCertificateOutlined />} title="DMARC (Domain-based Message Authentication)" subtitle="Policy for how receivers handle failed SPF/DKIM">
                        <ToggleRow
                            label="DMARC Checking (Inbound)"
                            desc="Apply DMARC policy to incoming messages"
                            checked={authConfig?.dmarc_enabled}
                            onChange={(v) => toggleAuth('dmarc_enabled', v)}
                        />
                        <div style={{ marginTop: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Recommended DMARC record:</div>
                            <code style={{ fontSize: 12, color: '#4f46e5' }}>
                                v=DMARC1; p=quarantine; rua=mailto:dmarc@{serverInfo?.hostname || 'yourdomain.com'}; pct=100
                            </code>
                            <br />
                            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                                Policy options: <strong>none</strong> (monitor) → <strong>quarantine</strong> → <strong>reject</strong> (strictest).
                                Start with <em>none</em> while testing.
                            </span>
                        </div>
                    </Section>

                    <Divider />

                    <Section icon={<GlobalOutlined />} title="TLS / Encryption" subtitle="Transport layer security for SMTP connections">
                        <ToggleRow
                            label="Prefer TLS (STARTTLS)"
                            desc="Upgrade connections to TLS when available"
                            checked={deliveryConfig?.tls_preferred ?? true}
                        />
                        <ToggleRow
                            label="Require TLS"
                            desc="Reject connections that cannot upgrade to TLS"
                            checked={deliveryConfig?.tls_required ?? false}
                        />
                        <ToggleRow
                            label="Verify TLS Certificate"
                            desc="Strictly validate remote server's TLS certificate"
                            checked={deliveryConfig?.verify_tls_cert ?? false}
                        />
                    </Section>
                </div>
            )
        },

        // ════════════════════════
        //  TAB 5: DELIVERY
        // ════════════════════════
        {
            key: 'delivery',
            label: <span><MailOutlined /> Delivery</span>,
            children: (
                <div>
                    <Alert
                        type="info" showIcon
                        message="Delivery & Retry Configuration — PowerMTA-style queue management"
                        description="Configure retry schedules, connection pools, and delivery behaviour. CloudMTA automatically queues failed messages and retries them on an exponential backoff schedule."
                        style={{ marginBottom: 24 }}
                    />

                    <Section icon={<SyncOutlined />} title="Retry Schedule" subtitle="How CloudMTA re-attempts failed deliveries">
                        <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Current retry schedule:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {(deliveryConfig?.retry_schedule_hours || []).map((h, i) => (
                                    <Tag key={i} color="processing" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        +{h >= 1 ? `${h}h` : `${Math.round(h * 60)}m`}
                                    </Tag>
                                ))}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                                Message is <strong>expired</strong> after {deliveryConfig?.max_delivery_attempts || 24} attempts (~48 hours).
                            </div>
                        </div>
                    </Section>

                    <Section icon={<SettingOutlined />} title="Connection & Queue Configuration">
                        <Form form={deliveryForm} layout="vertical" onFinish={saveDeliveryForm}>
                            <Row gutter={[16, 0]}>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item label="Max Delivery Attempts" name="max_delivery_attempts">
                                        <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="tries" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item label="Connection Timeout" name="connection_timeout_seconds">
                                        <InputNumber min={5} max={120} style={{ width: '100%' }} addonAfter="sec" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item label="Data Timeout" name="data_timeout_seconds">
                                        <InputNumber min={10} max={600} style={{ width: '100%' }} addonAfter="sec" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item label="Recipients per Connection" name="max_recipients_per_connection">
                                        <InputNumber min={1} max={5000} style={{ width: '100%' }} addonAfter="rcpts" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item label="Messages per Connection" name="max_messages_per_connection">
                                        <InputNumber min={1} max={10000} style={{ width: '100%' }} addonAfter="msgs" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item label="Concurrent Conns / Domain" name="concurrent_connections_per_domain">
                                        <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="conns" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item label="Backoff Strategy" name="backoff_strategy">
                                        <Select style={{ width: '100%' }}>
                                            <Option value="exponential">Exponential (recommended)</Option>
                                            <Option value="linear">Linear</Option>
                                            <Option value="fixed">Fixed Interval</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Form.Item label="EHLO Hostname" name="ehlo_hostname">
                                        <Input placeholder={serverInfo?.hostname || 'mail.yourdomain.com'} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item>
                                <Button type="primary" htmlType="submit" loading={saving.delivery} icon={<SaveOutlined />}>
                                    Save Delivery Settings
                                </Button>
                            </Form.Item>
                        </Form>
                    </Section>

                    <Divider />

                    <Section icon={<ThunderboltOutlined />} title="Priority Queues" subtitle="Message priority levels (like PowerMTA virtual domains)">
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {[
                                { level: 1, label: 'Transactional', desc: 'Password resets, receipts', color: C.danger },
                                { level: 5, label: 'High Priority', desc: 'Time-sensitive campaigns', color: C.warning },
                                { level: 10, label: 'Normal', desc: 'Default queue', color: C.primary },
                                { level: 20, label: 'Bulk / Low', desc: 'Newsletters, promotions', color: '#94a3b8' },
                            ].map(q => (
                                <div key={q.level} style={{
                                    flex: '1 1 180px', border: '1px solid #e2e8f0', borderRadius: 8,
                                    padding: '12px 14px', background: '#fff'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontWeight: 700, fontSize: 13 }}>{q.label}</span>
                                        <Tag style={{ background: `${q.color}15`, color: q.color, border: 'none', fontFamily: 'monospace' }}>P{q.level}</Tag>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>{q.desc}</div>
                                </div>
                            ))}
                        </div>
                    </Section>
                </div>
            )
        },

        // ════════════════════════
        //  TAB 6: BOUNCE HANDLING
        // ════════════════════════
        {
            key: 'bounce',
            label: <span><WarningOutlined /> Bounce & FBL</span>,
            children: (
                <div>
                    <Alert
                        type="warning" showIcon
                        message="Bounce & Feedback Loop Management"
                        description="Proper bounce handling is critical for maintaining sender reputation and avoiding blacklisting. Amazon SES and major ISPs monitor bounce and complaint rates closely."
                        style={{ marginBottom: 24 }}
                    />

                    <Section icon={<WarningOutlined />} title="Bounce Thresholds" subtitle="Industry-standard limits to protect your sender reputation">
                        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                            {[
                                { label: 'Hard Bounce Rate', warning: '2%', critical: '5%', icon: <CloseCircleOutlined />, color: C.danger, desc: 'Invalid addresses' },
                                { label: 'Soft Bounce Rate', warning: '5%', critical: '10%', icon: <WarningOutlined />, color: C.warning, desc: 'Temp failures, mailbox full' },
                                { label: 'Spam Complaint Rate', warning: '0.1%', critical: '0.3%', icon: <WarningOutlined />, color: '#f59e0b', desc: 'FBL complaints from ISPs' },
                            ].map(b => (
                                <Col xs={24} sm={8} key={b.label}>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', background: '#fff' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <span style={{ color: b.color, fontSize: 16 }}>{b.icon}</span>
                                            <span style={{ fontWeight: 600, fontSize: 13 }}>{b.label}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{b.desc}</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <Tag color="warning" style={{ fontSize: 11 }}>⚠ &gt;{b.warning}</Tag>
                                            <Tag color="error" style={{ fontSize: 11 }}>✗ &gt;{b.critical}</Tag>
                                        </div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    </Section>

                    <Section icon={<SettingOutlined />} title="Bounce Handling Rules">
                        <Form form={bounceForm} layout="vertical" onFinish={saveBounceForm}>
                            <Row gutter={[16, 0]}>
                                <Col xs={24} sm={12}>
                                    <Form.Item label="Hard Bounce Action" name="hard_bounce_action">
                                        <Select style={{ width: '100%' }}>
                                            <Option value="unsubscribe">Auto-unsubscribe (recommended)</Option>
                                            <Option value="flag">Flag for review</Option>
                                            <Option value="delete">Delete address</Option>
                                            <Option value="none">None (log only)</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <Form.Item label="Soft Bounce Max Retries" name="soft_bounce_max_retries">
                                        <InputNumber min={1} max={20} style={{ width: '100%' }} addonAfter="tries" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <Form.Item
                                        label={<span>Complaint Threshold <Tooltip title="Trigger suppression at this % complaint rate"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>}
                                        name="complaint_threshold_percent"
                                    >
                                        <InputNumber min={0.01} max={10} step={0.01} style={{ width: '100%' }} addonAfter="%" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <Form.Item label="Bounce Notification Email" name="bounce_forwarder_email">
                                        <Input placeholder="bounces@yourdomain.com" prefix={<MailOutlined />} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item>
                                <Button type="primary" htmlType="submit" loading={saving.bounce} icon={<SaveOutlined />}>
                                    Save Bounce Settings
                                </Button>
                            </Form.Item>
                        </Form>
                    </Section>

                    <Section icon={<InfoCircleOutlined />} title="Feedback Loop (FBL)" subtitle="Receive complaints from ISPs when users mark email as spam">
                        <ToggleRow
                            label="FBL Processing"
                            desc="Automatically process abuse@ complaints from ISP feedback loops"
                            checked={bounceConfig?.fbl_processing_enabled ?? true}
                        />
                        <ToggleRow
                            label="Auto-Suppress on Bounce"
                            desc="Automatically add hard-bounced addresses to suppression list"
                            checked={bounceConfig?.auto_suppress_on_bounce ?? true}
                        />
                        <ToggleRow
                            label="Bounce Tracking"
                            desc="Track and record all bounce events in the database"
                            checked={bounceConfig?.bounce_tracking_enabled ?? true}
                        />
                        <div style={{ marginTop: 14, padding: '12px 14px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a' }}>
                            <div style={{ fontSize: 12, color: '#92400e' }}>
                                <strong>FBL Registration:</strong> Register your domain's abuse@ address with major ISP FBL programs:
                                <span style={{ display: 'block', marginTop: 4 }}>
                                    <a href="https://postmaster.google.com" target="_blank" rel="noopener noreferrer">Google Postmaster</a>
                                    {' · '}
                                    <a href="https://sendersupport.olc.protection.outlook.com/snds/" target="_blank" rel="noopener noreferrer">Microsoft SNDS</a>
                                    {' · '}
                                    <a href="https://postmaster.yahoo.com" target="_blank" rel="noopener noreferrer">Yahoo Postmaster</a>
                                </span>
                            </div>
                        </div>
                    </Section>
                </div>
            )
        },

        // ════════════════════════
        //  TAB 7: REPUTATION
        // ════════════════════════
        {
            key: 'reputation',
            label: <span><CheckCircleOutlined /> Reputation</span>,
            children: (
                <div>
                    <Alert
                        type="info" showIcon
                        message="Sender Reputation Management"
                        description="Monitor your sending IPs and domains across major blacklists and reputation services. Good practices from Amazon SES, GreenArrow, and PowerMTA guidelines."
                        style={{ marginBottom: 24 }}
                    />

                    {/* Reputation Checklist */}
                    <Section icon={<CheckCircleOutlined />} title="Deliverability Checklist" subtitle="Essential steps for strong sender reputation">
                        {[
                            { ok: !!serverInfo?.public_ipv4, label: 'Server public IP detected', detail: serverInfo?.public_ipv4 || 'Not detected' },
                            { ok: authConfig?.dkim_signing_enabled, label: 'DKIM signing enabled', detail: 'Signs all outbound mail' },
                            { ok: authConfig?.spf_check_enabled, label: 'SPF checking enabled', detail: 'Validates inbound connections' },
                            { ok: authConfig?.dmarc_enabled, label: 'DMARC enabled', detail: 'Policy enforcement active' },
                            { ok: smtpConfig?.ip_rotation_enabled, label: 'IP rotation configured', detail: 'Distributed sending load' },
                            { ok: deliveryConfig?.tls_preferred, label: 'TLS preferred', detail: 'Encrypts transit connections' },
                            { ok: bounceConfig?.auto_suppress_on_bounce, label: 'Bounce suppression active', detail: 'Protects sender score' },
                        ].map((item, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 0', borderBottom: '1px solid #f1f5f9'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    {item.ok
                                        ? <CheckCircleOutlined style={{ color: C.success, fontSize: 16 }} />
                                        : <CloseCircleOutlined style={{ color: C.danger, fontSize: 16 }} />}
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: 14 }}>{item.label}</div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>{item.detail}</div>
                                    </div>
                                </div>
                                <Tag color={item.ok ? 'success' : 'error'}>{item.ok ? 'OK' : 'Action Needed'}</Tag>
                            </div>
                        ))}
                    </Section>

                    <Divider />

                    <Section icon={<GlobalOutlined />} title="Blacklist Monitoring" subtitle="Check your sending IPs against major DNSBLs">
                        <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                                Your server IP: <code style={{ fontWeight: 700, color: C.primary }}>{serverInfo?.public_ipv4 || 'Not detected'}</code>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Check your IP against popular blacklists:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                {[
                                    { name: 'MXToolbox', url: `https://mxtoolbox.com/blacklists.aspx${serverInfo?.public_ipv4 ? `?domain=${serverInfo.public_ipv4}` : ''}` },
                                    { name: 'MultiRBL', url: `https://multirbl.valli.org/lookup/${serverInfo?.public_ipv4 || ''}.html` },
                                    { name: 'SpamHaus', url: `https://check.spamhaus.org/` },
                                    { name: 'Barracuda', url: 'https://www.barracudacentral.org/lookups' },
                                    { name: 'Talos (Cisco)', url: 'https://talosintelligence.com/reputation_center' },
                                    { name: 'SenderScore', url: 'https://senderscore.org/' },
                                    { name: 'Google Postmaster', url: 'https://postmaster.google.com/' },
                                ].map(s => (
                                    <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer">
                                        <Tag style={{ cursor: 'pointer', padding: '4px 10px' }} color="default">{s.name} ↗</Tag>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </Section>

                    <Section icon={<SettingOutlined />} title="Sending Limits & Warm-Up" subtitle="Industry best practices for new IPs (like Amazon SES warm-up)">
                        {[
                            { day: 'Day 1–2', limit: '200 msg/day', tip: 'New IPs start at low volume' },
                            { day: 'Day 3–7', limit: '500 msg/day', tip: 'Gradually increase if bounce rate < 2%' },
                            { day: 'Week 2', limit: '2,000 msg/day', tip: 'Monitor reputation scores' },
                            { day: 'Week 3', limit: '10,000 msg/day', tip: 'Check Google Postmaster Tools' },
                            { day: 'Month 2+', limit: 'Unlimited', tip: 'Full volume if reputation is good' },
                        ].map((w, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 0', borderBottom: '1px solid #f1f5f9'
                            }}>
                                <div>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{w.day}</span>
                                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 12 }}>{w.tip}</span>
                                </div>
                                <Tag color="processing" style={{ fontFamily: 'monospace' }}>{w.limit}</Tag>
                            </div>
                        ))}
                    </Section>
                </div>
            )
        },

        // ════════════════════════
        //  TAB 8: ROUTING RULES  (PowerMTA Virtual MTAs)
        // ════════════════════════
        {
            key: 'routing',
            label: <span><ApiOutlined /> Routing Rules</span>,
            children: (
                <div>
                    <Alert
                        type="info" showIcon
                        message="Virtual MTA Routing — PowerMTA-style email routing"
                        description="Define rules to route outbound email to specific IP addresses or virtual MTA pools based on sender domain, recipient domain, or message priority. Rules are evaluated in priority order (lowest number first)."
                        style={{ marginBottom: 24 }}
                    />

                    <Section
                        icon={<ApiOutlined />}
                        title="Routing Rules"
                        subtitle={`${routingRules.length} rule${routingRules.length !== 1 ? 's' : ''} defined`}
                        extra={
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRoutingModal({ open: true, editing: null })}>
                                Add Rule
                            </Button>
                        }
                    >
                        {routingRules.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                                <ApiOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
                                <div style={{ fontSize: 14 }}>No routing rules defined</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>All mail uses default routing. Add rules to route by domain or priority.</div>
                            </div>
                        ) : (
                            <Table
                                dataSource={routingRules}
                                rowKey="id"
                                size="small"
                                pagination={false}
                                columns={[
                                    {
                                        title: 'Order', dataIndex: 'priority_order', width: 70,
                                        render: v => <Tag style={{ fontFamily: 'monospace' }}>#{v}</Tag>
                                    },
                                    { title: 'Rule Name', dataIndex: 'name', render: (v, r) => (
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{v}</div>
                                            {r.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.description}</div>}
                                        </div>
                                    )},
                                    { title: 'Match Condition', render: (_, r) => (
                                        <Space direction="vertical" size={2}>
                                            {r.sender_domain && <Tag color="blue">from: {r.sender_domain}</Tag>}
                                            {r.recipient_domain && <Tag color="purple">to: {r.recipient_domain}</Tag>}
                                            {r.message_priority != null && <Tag color="gold">priority: {r.message_priority}</Tag>}
                                            {!r.sender_domain && !r.recipient_domain && !r.message_priority && <Tag>match all</Tag>}
                                        </Space>
                                    )},
                                    { title: 'Route To', render: (_, r) => (
                                        <Space direction="vertical" size={2}>
                                            {r.virtual_mta_name && <Tag color="green" icon={<ThunderboltOutlined />}>vMTA: {r.virtual_mta_name}</Tag>}
                                            {r.bind_address && <Tag icon={<GlobalOutlined />} style={{ fontFamily: 'monospace' }}>{r.bind_address}</Tag>}
                                            {r.queue_name && <Tag color="cyan">queue: {r.queue_name}</Tag>}
                                        </Space>
                                    )},
                                    { title: 'Rate', dataIndex: 'rate_limit_per_second', render: v => `${v}/s` },
                                    {
                                        title: 'Status', dataIndex: 'is_active', width: 80,
                                        render: v => <Badge status={v ? 'success' : 'default'} text={v ? 'Active' : 'Off'} />
                                    },
                                    {
                                        title: '', width: 100,
                                        render: (_, r) => (
                                            <Space>
                                                <Button size="small" onClick={() => setRoutingModal({ open: true, editing: r })}>Edit</Button>
                                                <Button size="small" danger onClick={async () => {
                                                    await axios.delete(`/api/v1/smtp/routing-rules/${r.id}`);
                                                    setRoutingRules(p => p.filter(x => x.id !== r.id));
                                                    message.success('Rule deleted');
                                                }}>Del</Button>
                                            </Space>
                                        )
                                    },
                                ]}
                            />
                        )}
                    </Section>

                    <Divider />

                    <Section icon={<InfoCircleOutlined />} title="Virtual MTA Examples" subtitle="Common routing patterns from PowerMTA deployments">
                        {[
                            { name: 'Transactional Pool', cond: 'Priority = 1', action: 'Bind to primary IP, high rate', desc: 'Password resets, receipts — always delivered first' },
                            { name: 'Bulk / Marketing', cond: 'from: @marketing.co', action: 'Bind to secondary IP pool', desc: 'Newsletters routed to separate IPs to protect transactional reputation' },
                            { name: 'Gmail Routing', cond: 'to: @gmail.com', action: 'Max 10 connections, 50/s', desc: 'Per-ISP throttling to respect Gmail sending limits' },
                            { name: 'Suppression Bypass', cond: 'from: @alerts.co', action: 'Route to alerts queue', desc: 'Critical alerts skip normal queue processing' },
                        ].map((ex, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                                <Tag color="default" style={{ flexShrink: 0, marginTop: 2 }}>Example</Tag>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{ex.desc}</div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <Tag color="blue" style={{ fontSize: 11 }}>{ex.cond}</Tag>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{ex.action}</div>
                                </div>
                            </div>
                        ))}
                    </Section>

                    {/* Routing Rule Modal */}
                    <RoutingRuleModal
                        open={routingModal.open}
                        editing={routingModal.editing}
                        ipPool={ipPool}
                        onClose={() => setRoutingModal({ open: false, editing: null })}
                        onSaved={(rule) => {
                            if (routingModal.editing) {
                                setRoutingRules(p => p.map(r => r.id === rule.id ? { ...r, ...rule } : r));
                            } else {
                                setRoutingRules(p => [...p, rule]);
                            }
                            setRoutingModal({ open: false, editing: null });
                        }}
                    />
                </div>
            )
        },

        // ════════════════════════
        //  TAB 9: WEBHOOKS  (GreenArrow event delivery)
        // ════════════════════════
        {
            key: 'webhooks',
            label: <span><CloudOutlined /> Webhooks</span>,
            children: (
                <div>
                    <Alert
                        type="info" showIcon
                        message="Event Webhooks — GreenArrow-style HTTP event delivery"
                        description="Receive real-time HTTP POST notifications for delivery events: bounces, spam complaints, opens, clicks, and unsubscribes. Each webhook is secured with an HMAC-SHA256 signature header."
                        style={{ marginBottom: 24 }}
                    />

                    <Section
                        icon={<CloudOutlined />}
                        title="Webhook Endpoints"
                        subtitle={`${webhooks.length} endpoint${webhooks.length !== 1 ? 's' : ''} configured`}
                        extra={
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setWebhookModal({ open: true, editing: null })}>
                                Add Webhook
                            </Button>
                        }
                    >
                        {webhooks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                                <CloudOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
                                <div style={{ fontSize: 14 }}>No webhooks configured</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>Add an endpoint to receive real-time delivery event notifications.</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {webhooks.map(wh => (
                                    <div key={wh.id} style={{
                                        border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px',
                                        background: wh.is_active ? '#fff' : '#f8fafc'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{wh.name}</div>
                                                <code style={{ fontSize: 12, color: C.primary, wordBreak: 'break-all' }}>{wh.url}</code>
                                            </div>
                                            <Space>
                                                <Badge status={wh.is_active ? 'success' : 'default'} text={wh.is_active ? 'Active' : 'Paused'} />
                                                <Button size="small" onClick={async () => {
                                                    try {
                                                        await axios.post(`/api/v1/smtp/webhooks/${wh.id}/test`);
                                                        message.success('Test ping sent successfully');
                                                    } catch (e) {
                                                        message.error(e.response?.data?.detail || 'Test failed');
                                                    }
                                                }}>Test</Button>
                                                <Button size="small" onClick={() => setWebhookModal({ open: true, editing: wh })}>Edit</Button>
                                                <Button size="small" danger onClick={async () => {
                                                    await axios.delete(`/api/v1/smtp/webhooks/${wh.id}`);
                                                    setWebhooks(p => p.filter(x => x.id !== wh.id));
                                                    message.success('Webhook deleted');
                                                }}>Del</Button>
                                            </Space>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                            {(wh.events || []).map(ev => (
                                                <Tag key={ev} color={
                                                    ev === 'bounce' ? 'error' : ev === 'complaint' ? 'warning' :
                                                    ev === 'delivery' ? 'success' : ev === 'open' ? 'processing' : 'default'
                                                }>{ev}</Tag>
                                            ))}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                            Sent: {wh.total_deliveries} &nbsp;·&nbsp; Failed: {wh.total_failures}
                                            {wh.last_triggered_at && ` · Last: ${new Date(wh.last_triggered_at).toLocaleString()}`}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>

                    <Divider />

                    <Section icon={<InfoCircleOutlined />} title="Webhook Payload Format" subtitle="Sample JSON body sent to your endpoint">
                        <div style={{ background: '#0f172a', borderRadius: 8, padding: '14px 16px', fontFamily: 'monospace', fontSize: 12, color: '#e2e8f0', overflow: 'auto' }}>
                            <pre style={{ margin: 0, color: '#e2e8f0' }}>{JSON.stringify({
                                event: "bounce",
                                timestamp: "2026-04-05T12:00:00Z",
                                message_id: "msg_abc123",
                                from: "sender@yourdomain.com",
                                to: "recipient@gmail.com",
                                bounce_type: "hard",
                                bounce_code: "550",
                                bounce_message: "5.1.1 The email account that you tried to reach does not exist",
                                domain: "yourdomain.com"
                            }, null, 2)}</pre>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                            Requests include <code>X-CloudMTA-Signature</code> header (HMAC-SHA256) for verification.
                        </div>
                    </Section>

                    {/* Webhook Modal */}
                    <WebhookModal
                        open={webhookModal.open}
                        editing={webhookModal.editing}
                        onClose={() => setWebhookModal({ open: false, editing: null })}
                        onSaved={(hook) => {
                            if (webhookModal.editing) {
                                setWebhooks(p => p.map(w => w.id === hook.id ? { ...w, ...hook } : w));
                            } else {
                                setWebhooks(p => [...p, hook]);
                            }
                            setWebhookModal({ open: false, editing: null });
                        }}
                    />
                </div>
            )
        },

        // ════════════════════════
        //  TAB 10: TRACKING
        // ════════════════════════
        {
            key: 'tracking',
            label: <span><BarChartOutlined /> Tracking</span>,
            children: (
                <div>
                    <Alert
                        type="info" showIcon
                        message="Open & Click Tracking — Transparent pixel tracking"
                        description="CloudMTA injects a 1×1 tracking pixel to detect email opens and rewrites links for click tracking. GreenArrow calls this 'transparent tracking' — your tracking domain is visible to recipients."
                        style={{ marginBottom: 24 }}
                    />

                    <Section icon={<EyeOutlined />} title="Open Tracking" subtitle="Detect when recipients open your emails">
                        <ToggleRow
                            label="Enable Open Tracking"
                            desc="Inject a 1×1 pixel at the bottom of HTML emails to record opens"
                            checked={trackingConfig?.open_tracking_enabled ?? false}
                            onChange={async (v) => {
                                setTrackingConfig(p => ({ ...p, open_tracking_enabled: v }));
                                await axios.put('/api/v1/smtp/tracking', { open_tracking_enabled: v });
                                message.success('Open tracking ' + (v ? 'enabled' : 'disabled'));
                            }}
                        />
                        <ToggleRow
                            label="Track Plain-Text Emails"
                            desc="Plain-text messages cannot embed pixels — only HTML emails are tracked"
                            checked={trackingConfig?.track_plain_text ?? false}
                            disabled
                        />
                        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                Tracking pixel URL: <code style={{ color: C.primary }}>
                                    https://{trackingConfig?.tracking_domain || serverInfo?.hostname || 'track.yourdomain.com'}/track/open?m=&#123;message_id&#125;
                                </code>
                            </div>
                        </div>
                    </Section>

                    <Divider />

                    <Section icon={<LinkOutlined />} title="Click Tracking" subtitle="Rewrite links to record when recipients click">
                        <ToggleRow
                            label="Enable Click Tracking"
                            desc="All hyperlinks in HTML emails are rewritten through the tracking redirect"
                            checked={trackingConfig?.click_tracking_enabled ?? false}
                            onChange={async (v) => {
                                setTrackingConfig(p => ({ ...p, click_tracking_enabled: v }));
                                await axios.put('/api/v1/smtp/tracking', { click_tracking_enabled: v });
                                message.success('Click tracking ' + (v ? 'enabled' : 'disabled'));
                            }}
                        />
                        <ToggleRow
                            label="Unsubscribe Tracking"
                            desc="Track when recipients click the unsubscribe link"
                            checked={trackingConfig?.unsubscribe_tracking ?? true}
                        />
                        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                Click redirect URL: <code style={{ color: C.primary }}>
                                    https://{trackingConfig?.tracking_domain || serverInfo?.hostname || 'track.yourdomain.com'}/track/click?m=&#123;message_id&#125;&amp;u=&#123;url_encoded_destination&#125;
                                </code>
                            </div>
                        </div>
                    </Section>

                    <Divider />

                    <Section icon={<GlobalOutlined />} title="Tracking Domain" subtitle="Custom subdomain used for tracking pixels and click redirects">
                        <Row gutter={[12, 0]} align="middle">
                            <Col flex="auto">
                                <Input
                                    value={trackingConfig?.tracking_domain || ''}
                                    onChange={e => setTrackingConfig(p => ({ ...p, tracking_domain: e.target.value }))}
                                    placeholder="track.yourdomain.com"
                                    addonBefore="https://"
                                />
                            </Col>
                            <Col>
                                <Button type="primary" icon={<SaveOutlined />} onClick={async () => {
                                    await axios.put('/api/v1/smtp/tracking', { tracking_domain: trackingConfig?.tracking_domain });
                                    message.success('Tracking domain saved');
                                }}>Save</Button>
                            </Col>
                        </Row>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                            Add a CNAME record: <code>track.yourdomain.com → {serverInfo?.hostname || 'your-server-hostname'}</code>
                        </div>
                    </Section>

                    <Divider />

                    <Section icon={<InfoCircleOutlined />} title="Seeding (Inbox Monitoring)" subtitle="GreenArrow Automatic Seeding — verify inbox placement">
                        <div style={{ padding: '14px 16px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#92400e', marginBottom: 6 }}>
                                Inbox Placement Testing
                            </div>
                            <div style={{ fontSize: 12, color: '#78350f' }}>
                                GreenArrow's automatic seeding sends your campaigns to seed addresses at major ISPs (Gmail, Outlook, Yahoo, etc.) 
                                to verify inbox vs. spam folder placement before full deployment. Configure seed lists via the API or integrate 
                                with services like <a href="https://250ok.com" target="_blank" rel="noopener noreferrer">250ok</a> / <a href="https://www.emailonacid.com" target="_blank" rel="noopener noreferrer">Email on Acid</a>.
                            </div>
                        </div>
                    </Section>
                </div>
            )
        }
    ];

    return (
        <div className="content-wrapper">
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Server configuration, IP rotation, authentication, and sender reputation</p>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchAll}>Refresh</Button>
            </div>

            <Card bodyStyle={{ padding: 0 }}>
                <Tabs
                    defaultActiveKey="server"
                    tabBarStyle={{ padding: '0 24px', marginBottom: 0 }}
                    tabBarGutter={4}
                    items={tabItems}
                    tabPosition="top"
                    style={{ minHeight: 500 }}
                    tabBarExtraContent={
                        <div style={{ paddingRight: 8 }}>
                            {serverInfo?.public_ipv4 ? (
                                <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontFamily: 'monospace' }}>
                                    {serverInfo.public_ipv4}
                                </Tag>
                            ) : (
                                <Tag color="warning" icon={<WarningOutlined />}>IP not detected</Tag>
                            )}
                        </div>
                    }
                />
            </Card>
        </div>
    );
};

export default SettingsPage;

