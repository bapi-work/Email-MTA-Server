import React, { useState, useEffect, useCallback } from 'react';
import {
    Card, Form, Input, Select, Switch, Button, message, Spin, Tag,
    Row, Col, Table, Tooltip, Alert, Divider, InputNumber, Modal, Badge,
    Space, Checkbox, Popconfirm, Typography, List, Steps, Progress
} from 'antd';
import {
    SaveOutlined, SyncOutlined, PlusOutlined, DeleteOutlined,
    InfoCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
    ThunderboltOutlined, SafetyCertificateOutlined, GlobalOutlined,
    SettingOutlined, DatabaseOutlined, CloudOutlined, ApiOutlined,
    WarningOutlined, LoadingOutlined, CopyOutlined, ReloadOutlined,
    MailOutlined, LockOutlined, EyeOutlined, LinkOutlined, BarChartOutlined,
    FireOutlined, AimOutlined, ExperimentOutlined, AppstoreOutlined,
    RocketOutlined, EditOutlined, PauseCircleOutlined, PlayCircleOutlined,
    ArrowRightOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

// ─────────────────────────────────────────────
//  Hostname validation helpers
// ─────────────────────────────────────────────

/** Returns true if the string looks like a real FQDN for DNS record use. */
const isValidFQDN = (h) => {
    if (!h || !h.includes('.')) return false;
    // Docker container IDs are 12 hex chars with no dots
    if (/^[0-9a-f]{12}$/i.test(h)) return false;
    // Reject bare local hostnames
    if (h.endsWith('.local') || h === 'localhost') return false;
    return true;
};

/**
 * Pick the best hostname for DNS record display.
 * Prefers configured_hostname (set by admin via SMTP_HOSTNAME env var) over
 * the detected hostname which inside Docker is the container ID.
 */
const getDisplayHostname = (serverInfo) => {
    if (isValidFQDN(serverInfo?.configured_hostname)) return serverInfo.configured_hostname;
    if (isValidFQDN(serverInfo?.hostname)) return serverInfo.hostname;
    return null;
};

const C = {
    primary: '#4f46e5',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
};

// ─────────────────────────────────────────────
//  Sidebar nav config
// ─────────────────────────────────────────────
const NAV_GROUPS = [
    {
        label: 'Overview',
        items: [
            { key: 'server', icon: <DatabaseOutlined />, label: 'Server Info' },
        ]
    },
    {
        label: 'Sending',
        items: [
            { key: 'ip', icon: <ThunderboltOutlined />, label: 'IP Rotation' },
            { key: 'smtp', icon: <SettingOutlined />, label: 'SMTP Config' },
            { key: 'delivery', icon: <MailOutlined />, label: 'Delivery' },
        ]
    },
    {
        label: 'Security',
        items: [
            { key: 'auth', icon: <LockOutlined />, label: 'Authentication' },
            { key: 'bounce', icon: <WarningOutlined />, label: 'Bounce & FBL' },
        ]
    },
    {
        label: 'Reputation',
        items: [
            { key: 'reputation', icon: <CheckCircleOutlined />, label: 'Reputation' },
            { key: 'warmup', icon: <RocketOutlined />, label: 'IP Warmup' },
        ]
    },
    {
        label: 'Routing',
        items: [
            { key: 'routing', icon: <ApiOutlined />, label: 'Routing Rules' },
            { key: 'isp-profiles', icon: <GlobalOutlined />, label: 'ISP Profiles' },
        ]
    },
    {
        label: 'Integrations',
        items: [
            { key: 'webhooks', icon: <CloudOutlined />, label: 'Webhooks' },
            { key: 'tracking', icon: <BarChartOutlined />, label: 'Tracking' },
        ]
    },
    {
        label: 'Advanced',
        items: [
            { key: 'simulator', icon: <ExperimentOutlined />, label: 'Simulator' },
            { key: 'config-sets', icon: <AppstoreOutlined />, label: 'Config Sets' },
        ]
    },
];

// ─────────────────────────────────────────────
//  Reusable section wrapper
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
//  Toggle row
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
//  IP badge
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
//  Warmup Progress Card
// ─────────────────────────────────────────────
const WARMUP_STAGES = [
    { label: 'Day 1', limit: 200, day: 1 },
    { label: 'Day 3', limit: 500, day: 3 },
    { label: 'Day 7', limit: 1000, day: 7 },
    { label: 'Day 14', limit: 5000, day: 14 },
    { label: 'Day 30', limit: 20000, day: 30 },
    { label: 'Day 60+', limit: null, day: 60 },
];

const getStageIndex = (daysActive) => {
    for (let i = WARMUP_STAGES.length - 1; i >= 0; i--) {
        if (daysActive >= WARMUP_STAGES[i].day) return i;
    }
    return 0;
};

const WarmupCard = ({ schedule, onEdit, onDelete, onToggle }) => {
    const stageIdx = getStageIndex(schedule.days_active || 0);
    const stage = WARMUP_STAGES[stageIdx];
    const nextStage = WARMUP_STAGES[stageIdx + 1];
    const pct = Math.round(((schedule.days_active || 0) / 60) * 100);
    const sentPct = stage.limit ? Math.round(((schedule.today_sent || 0) / stage.limit) * 100) : 0;

    return (
        <div style={{
            border: `1px solid ${schedule.is_active ? '#e0e7ff' : '#e2e8f0'}`,
            borderRadius: 12,
            padding: '16px 20px',
            background: schedule.is_active ? '#fafbff' : '#f8fafc',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {schedule.is_active && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg, ${C.primary}, #7c3aed)`,
                }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <code style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>
                            {schedule.ip_address}
                        </code>
                        <Tag color={schedule.is_active ? 'success' : 'default'} style={{ margin: 0 }}>
                            {schedule.is_active ? 'Active' : 'Paused'}
                        </Tag>
                    </div>
                    {schedule.notes && (
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{schedule.notes}</div>
                    )}
                </div>
                <Space>
                    <Tooltip title={schedule.is_active ? 'Pause warmup' : 'Resume warmup'}>
                        <Button
                            size="small"
                            icon={schedule.is_active ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                            onClick={() => onToggle(schedule)}
                        />
                    </Tooltip>
                    <Tooltip title="Edit schedule">
                        <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(schedule)} />
                    </Tooltip>
                    <Popconfirm title="Delete this warmup schedule?" onConfirm={() => onDelete(schedule)}>
                        <Tooltip title="Delete">
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            </div>

            <Row gutter={[16, 12]}>
                <Col xs={24} sm={8}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Current Stage</div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: C.primary }}>{stage.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Day {schedule.days_active || 0} of warmup</div>
                </Col>
                <Col xs={24} sm={8}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Today's Limit</div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#0f172a' }}>
                        {stage.limit ? stage.limit.toLocaleString() : '∞'}
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}> /day</span>
                    </div>
                    {stage.limit && (
                        <Progress
                            percent={Math.min(sentPct, 100)}
                            size="small"
                            strokeColor={sentPct > 80 ? C.warning : C.success}
                            format={() => `${(schedule.today_sent || 0).toLocaleString()} sent`}
                            style={{ marginTop: 4 }}
                        />
                    )}
                </Col>
                <Col xs={24} sm={8}>
                    {nextStage ? (
                        <>
                            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Next Stage</div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ArrowRightOutlined style={{ color: C.primary }} /> Day {nextStage.day} → {nextStage.limit?.toLocaleString()}/day
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                in {Math.max(0, nextStage.day - (schedule.days_active || 0))} days
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Status</div>
                            <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 13 }}>Fully Warmed Up</Tag>
                        </>
                    )}
                </Col>
            </Row>

            <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Overall warmup progress</div>
                <Progress
                    percent={Math.min(pct, 100)}
                    strokeColor={{ '0%': C.primary, '100%': '#7c3aed' }}
                    format={(p) => `${p}% (Day ${schedule.days_active || 0}/60)`}
                />
            </div>

            {schedule.start_date && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                    Started: {new Date(schedule.start_date).toLocaleDateString()}
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
//  Routing Rule Modal
// ─────────────────────────────────────────────
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
        <Modal open={open} title={editing ? 'Edit Routing Rule' : 'New Routing Rule'} onCancel={onClose}
            onOk={handleOk} confirmLoading={saving} width={620} destroyOnClose>
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
                <Divider orientationMargin={0} style={{ fontSize: 12, color: '#64748b' }}>Match Conditions</Divider>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item label="Sender Domain" name="sender_domain" tooltip="e.g. marketing.co">
                            <Input placeholder="marketing.co" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="Recipient Domain" name="recipient_domain" tooltip="e.g. gmail.com">
                            <Input placeholder="gmail.com" />
                        </Form.Item>
                    </Col>
                </Row>
                <Divider orientationMargin={0} style={{ fontSize: 12, color: '#64748b' }}>Routing Actions</Divider>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item label="Virtual MTA Name" name="virtual_mta_name">
                            <Input placeholder="bulk-pool" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="Bind IP Address" name="bind_address">
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

// ─────────────────────────────────────────────
//  Webhook Modal
// ─────────────────────────────────────────────
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
        <Modal open={open} title={editing ? 'Edit Webhook' : 'New Webhook Endpoint'} onCancel={onClose}
            onOk={handleOk} confirmLoading={saving} width={560} destroyOnClose>
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
                                <Tag color={ev === 'bounce' ? 'error' : ev === 'complaint' ? 'warning' :
                                    ev === 'delivery' ? 'success' : ev === 'open' ? 'processing' : 'default'}>{ev}</Tag>
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

// ─────────────────────────────────────────────
//  DNS Record display box with copy button
// ─────────────────────────────────────────────
const DnsRecordBox = ({ label, domain, dnsName, type, value, onCopy, dim, note }) => (
    <div style={{ marginTop: 12, opacity: dim ? 0.6 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
                {label} <code style={{ color: '#4f46e5', fontWeight: 600 }}>{domain}</code>
            </span>
            <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>{type}</Tag>
        </div>
        <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start'
        }}>
            <div style={{ flex: 1 }}>
                {dnsName !== domain && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                        Name: <code style={{ color: '#475569' }}>{dnsName}</code>
                    </div>
                )}
                <code style={{ fontSize: 12, color: '#4f46e5', wordBreak: 'break-all', display: 'block' }}>
                    {value}
                </code>
            </div>
            <Tooltip title="Copy value">
                <Button
                    size="small" type="text" icon={<CopyOutlined />}
                    onClick={() => onCopy(value)}
                    style={{ flexShrink: 0, color: '#94a3b8', marginTop: 2 }}
                />
            </Tooltip>
        </div>
        {note && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                <InfoCircleOutlined style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{note}</span>
            </div>
        )}
    </div>
);

// ─────────────────────────────────────────────
//  EmptyState helper
// ─────────────────────────────────────────────
const EmptyState = ({ icon, title, desc, action }) => (
    <div style={{
        textAlign: 'center', padding: '48px 24px',
        background: '#f8fafc', borderRadius: 12, border: '2px dashed #e2e8f0'
    }}>
        <div style={{ fontSize: 40, color: '#cbd5e1', marginBottom: 12 }}>{icon}</div>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#475569', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: action ? 20 : 0, maxWidth: 340, margin: '0 auto' }}>{desc}</div>
        {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
);

// ─────────────────────────────────────────────
//  Main SettingsPage
// ─────────────────────────────────────────────
const SettingsPage = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState({});
    const [activeTab, setActiveTab] = useState('server');
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

    const [warmupSchedules, setWarmupSchedules] = useState([]);
    const [warmupModal, setWarmupModal] = useState({ open: false, editing: null });
    const [domains, setDomains] = useState([]);
    const [authDomain, setAuthDomain] = useState('');
    const [ispProfiles, setIspProfiles] = useState([]);
    const [simulatorScenarios, setSimulatorScenarios] = useState([]);
    const [simulatorResult, setSimulatorResult] = useState(null);
    const [simulatorRunning, setSimulatorRunning] = useState(false);
    const [configSets, setConfigSets] = useState([]);
    const [configSetModal, setConfigSetModal] = useState({ open: false, editing: null });
    const [warmupForm] = Form.useForm();
    const [simulatorForm] = Form.useForm();
    const [configSetForm] = Form.useForm();

    const fetchAll = useCallback(async () => {
        try {
            const [srvRes, smtpRes, authRes, ipRes, delRes, bncRes, routeRes, hookRes, trackRes,
                warmupRes, ispRes, simRes, csRes, domainsRes] = await Promise.allSettled([
                axios.get('/api/v1/smtp/server-info'),
                axios.get('/api/v1/smtp/config'),
                axios.get('/api/v1/smtp/authentication'),
                axios.get('/api/v1/smtp/ip-pool'),
                axios.get('/api/v1/smtp/delivery-config'),
                axios.get('/api/v1/smtp/bounce-config'),
                axios.get('/api/v1/smtp/routing-rules'),
                axios.get('/api/v1/smtp/webhooks'),
                axios.get('/api/v1/smtp/tracking'),
                axios.get('/api/v1/smtp/warmup'),
                axios.get('/api/v1/smtp/isp-profiles'),
                axios.get('/api/v1/smtp/simulator/scenarios'),
                axios.get('/api/v1/smtp/configuration-sets'),
                axios.get('/api/v1/domains?limit=100'),
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
            if (warmupRes.status === 'fulfilled') setWarmupSchedules(warmupRes.value.data || []);
            if (ispRes.status === 'fulfilled') setIspProfiles(ispRes.value.data?.profiles || []);
            if (simRes.status === 'fulfilled') setSimulatorScenarios(simRes.value.data?.scenarios || []);
            if (csRes.status === 'fulfilled') setConfigSets(csRes.value.data || []);
            if (domainsRes.status === 'fulfilled') {
                const list = domainsRes.value.data || [];
                setDomains(list);
                // Pre-select the first verified (or any) domain for DNS record templates
                if (list.length > 0 && !authDomain) {
                    const verified = list.find(d => d.is_verified) || list[0];
                    setAuthDomain(verified.domain_name);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [smtpForm, deliveryForm, bounceForm]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

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
            message.success('Delivery settings saved');
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
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
                <Spin size="large" tip="Loading settings…" />
            </div>
        );
    }

    const allIPv4 = [...new Set([
        ...(ipPool?.detected_ipv4 ? [ipPool.detected_ipv4] : []),
        ...(ipPool?.ipv4 || [])
    ])];
    const allIPv6 = [...new Set([
        ...(ipPool?.detected_ipv6 ? [ipPool.detected_ipv6] : []),
        ...(ipPool?.ipv6 || [])
    ])];

    // ─────────────────────────────────────────
    //  Tab content renderers
    // ─────────────────────────────────────────

    const renderServer = () => (
        <div>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {[
                    {
                        label: 'Hostname',
                        value: getDisplayHostname(serverInfo) || serverInfo?.configured_hostname || '—',
                        fallback: null,
                        bg: getDisplayHostname(serverInfo) ? '#f8fafc' : '#fefce8',
                        border: getDisplayHostname(serverInfo) ? '#e2e8f0' : '#fde68a',
                        color: '#0f172a',
                        note: !getDisplayHostname(serverInfo) && serverInfo?.hostname
                            ? `Detected: ${serverInfo.hostname} (container ID — set SMTP_HOSTNAME env var)`
                            : null
                    },
                    {
                        label: 'Public IPv4', value: serverInfo?.public_ipv4, fallback: 'Not detected',
                        bg: '#f0fdf4', border: '#bbf7d0', color: '#065f46', mono: true,
                        copy: serverInfo?.public_ipv4
                    },
                    {
                        label: 'Public IPv6', value: serverInfo?.public_ipv6, fallback: 'Not detected',
                        bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', mono: true
                    },
                ].map(c => (
                    <Col xs={24} sm={8} key={c.label}>
                        <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px' }}>
                            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                                {c.label}
                                {c.label === 'Public IPv4' && (
                                    <Tooltip title="Live-detected public IP">
                                        <InfoCircleOutlined style={{ marginLeft: 4, color: '#94a3b8' }} />
                                    </Tooltip>
                                )}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: c.mono ? 15 : 14, color: c.color, fontFamily: c.mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>
                                {c.value || <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 13 }}>{c.fallback}</span>}
                            </div>
                            {c.copy && (
                                <Button size="small" type="text" icon={<CopyOutlined />}
                                    onClick={() => copyToClipboard(c.copy)}
                                    style={{ marginTop: 4, padding: '0 4px', color: '#94a3b8', height: 20 }} />
                            )}
                            {c.note && (
                                <Tooltip title={c.note}>
                                    <div style={{ fontSize: 11, color: '#b45309', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
                                        <WarningOutlined style={{ fontSize: 11 }} /> Not a valid domain
                                    </div>
                                </Tooltip>
                            )}
                        </div>
                    </Col>
                ))}
            </Row>

            <Section icon={<CloudOutlined />} title="SMTP Listening Ports" subtitle="Ports this server accepts SMTP connections on">
                <Row gutter={[12, 12]}>
                    {[
                        { label: 'SMTP (Unencrypted)', port: serverInfo?.ports?.smtp || 25, desc: 'Standard MTA-to-MTA delivery', color: C.warning },
                        { label: 'Submission (STARTTLS)', port: serverInfo?.ports?.submission || 587, desc: 'Client submission, upgrades to TLS', color: C.success },
                        { label: 'SMTPS (SSL/TLS)', port: serverInfo?.ports?.smtps || 465, desc: 'SSL-wrapped connection', color: C.primary },
                    ].map(p => (
                        <Col xs={24} sm={8} key={p.port}>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', background: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
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
    );

    const renderIP = () => (
        <div>
            <Alert type="info" showIcon
                message="IP Rotation — similar to PowerMTA virtual MTAs"
                description="CloudMTA rotates outgoing connections across your IP pool. Add multiple IPs to distribute sending load and improve deliverability."
                style={{ marginBottom: 24 }} />

            <Section icon={<ThunderboltOutlined />} title="Rotation Settings" subtitle="Control how CloudMTA rotates across IP addresses">
                <ToggleRow label="Enable IP Rotation" desc="Distribute outbound connections across all IPs in the pool"
                    checked={smtpConfig?.ip_rotation_enabled} onChange={(v) => toggleSMTP('ip_rotation_enabled', v)} />
                <ToggleRow label="IPv4 Sending" desc="Allow outbound connections over IPv4"
                    checked={smtpConfig?.ipv4_enabled} onChange={(v) => toggleSMTP('ipv4_enabled', v)} />
                <ToggleRow label="IPv6 Sending" desc="Allow outbound connections over IPv6 (requires IPv6 connectivity)"
                    checked={smtpConfig?.ipv6_enabled} onChange={(v) => toggleSMTP('ipv6_enabled', v)} />
                <div style={{ padding: '12px 0' }}>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 8 }}>
                        Rotation Interval
                        <Tooltip title="How often (seconds) to cycle to the next IP">
                            <InfoCircleOutlined style={{ marginLeft: 6, color: '#94a3b8', fontSize: 12 }} />
                        </Tooltip>
                    </div>
                    <Form form={smtpForm} onFinish={saveSMTPForm} layout="inline">
                        <Form.Item name="ip_rotation_interval" style={{ marginBottom: 0 }}>
                            <InputNumber min={30} max={86400} addonAfter="seconds" style={{ width: 180 }} />
                        </Form.Item>
                        <Form.Item style={{ marginBottom: 0 }}>
                            <Button type="primary" htmlType="submit" loading={saving.smtp} icon={<SaveOutlined />}>Save</Button>
                        </Form.Item>
                    </Form>
                </div>
            </Section>

            <Section icon={<GlobalOutlined />} title="IPv4 Address Pool" subtitle={`${allIPv4.length} address${allIPv4.length !== 1 ? 'es' : ''} — first is primary`}>
                <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allIPv4.map(ip => (
                        <IPBadge key={ip} ip={ip} isDetected={ip === ipPool?.detected_ipv4}
                            onRemove={ip !== ipPool?.detected_ipv4 ? removeIp : undefined} />
                    ))}
                    {allIPv4.length === 0 && <span style={{ color: '#94a3b8', fontSize: 13 }}>No IPv4 addresses detected or added</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <Input value={newIpInput} onChange={e => setNewIpInput(e.target.value)} onPressEnter={addIp}
                        placeholder="Add IP (e.g. 1.2.3.4 or 2001:db8::1)" style={{ width: 260 }} />
                    <Button type="primary" icon={addingIp ? <LoadingOutlined /> : <PlusOutlined />} onClick={addIp} loading={addingIp}>
                        Add IP
                    </Button>
                </div>
            </Section>

            {allIPv6.length > 0 && (
                <Section icon={<GlobalOutlined />} title="IPv6 Address Pool" subtitle={`${allIPv6.length} IPv6 address${allIPv6.length !== 1 ? 'es' : ''}`}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {allIPv6.map(ip => (
                            <IPBadge key={ip} ip={ip} isDetected={ip === ipPool?.detected_ipv6}
                                onRemove={ip !== ipPool?.detected_ipv6 ? removeIp : undefined} />
                        ))}
                    </div>
                </Section>
            )}

            <Alert type="warning" showIcon message="SPF Record Update Required"
                description="When you add or remove IP addresses, regenerate the SPF record for each domain in the Domains section." style={{ marginTop: 12 }} />
        </div>
    );

    const renderSMTP = () => (
        <div>
            <Section icon={<CloudOutlined />} title="Connection Limits" subtitle="Control concurrency and connection behaviour">
                <Form form={smtpForm} layout="vertical" onFinish={saveSMTPForm}>
                    <Row gutter={[16, 0]}>
                        <Col xs={24} sm={12} md={8}>
                            <Form.Item label={<span>Max Concurrent Connections <Tooltip title="Maximum parallel SMTP connections"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>} name="max_connections">
                                <InputNumber min={1} max={100000} style={{ width: '100%' }} addonAfter="conns" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Form.Item label={<span>SMTP Timeout <Tooltip title="Seconds to wait before closing a connection"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>} name="timeout">
                                <InputNumber min={5} max={300} style={{ width: '100%' }} addonAfter="sec" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Form.Item label={<span>Queue Size <Tooltip title="Maximum messages held in memory queue"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>} name="queue_size">
                                <InputNumber min={100} max={10000000} style={{ width: '100%' }} addonAfter="msgs" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Form.Item label="Default Rate Limit" name="rate_limit_per_second_default">
                                <InputNumber min={1} max={10000} style={{ width: '100%' }} addonAfter="msg/s" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Form.Item label="API Rate Limit" name="rate_limit_per_second_api">
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
                <ToggleRow label="Rate Limiting" desc="Enforce per-second message limits"
                    checked={smtpConfig?.rate_limit_enabled} onChange={(v) => toggleSMTP('rate_limit_enabled', v)} />
                <ToggleRow label="Bulk Email" desc="Enable high-volume bulk sending campaigns"
                    checked={smtpConfig?.bulk_email_enabled} />
            </Section>
        </div>
    );

    const renderAuth = () => {
        const activeDomain = authDomain.trim();
        const domainPlaceholder = activeDomain || 'yourdomain.com';
        const spfIPs = [
            serverInfo?.public_ipv4 ? `ip4:${serverInfo.public_ipv4}` : null,
            serverInfo?.public_ipv6 ? `ip6:${serverInfo.public_ipv6}` : null,
        ].filter(Boolean).join(' ') || 'ip4:YOUR_SERVER_IP';
        const spfRecord = `v=spf1 mx a ${spfIPs} ~all`;
        const dkimSelector = domains.find(d => d.domain_name === activeDomain)?.dkim_selector || 'default';
        const dmarcRecord = `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domainPlaceholder}; ruf=mailto:dmarc@${domainPlaceholder}; pct=100`;
        const dkimDnsName = `${dkimSelector}._domainkey.${domainPlaceholder}`;

        return (
        <div>
            {/* Domain selector — drives all DNS record templates on this tab */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
                padding: '14px 16px', background: '#f0f4ff', borderRadius: 10,
                border: '1px solid #c7d2fe'
            }}>
                <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#4338ca', marginBottom: 4 }}>Domain for DNS records</div>
                    <div style={{ fontSize: 11, color: '#6366f1' }}>Select or type the domain to generate SPF · DKIM · DMARC records for</div>
                </div>
                <div style={{ flex: 1, maxWidth: 360 }}>
                    <Select
                        showSearch
                        allowClear
                        value={activeDomain || undefined}
                        placeholder="Select a domain or type one…"
                        style={{ width: '100%' }}
                        onChange={(v) => setAuthDomain(v || '')}
                        dropdownRender={(menu) => (
                            <div>
                                {menu}
                                <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0' }}>
                                    <Input
                                        size="small"
                                        placeholder="Or type a domain manually…"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                setAuthDomain(e.target.value.trim());
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    >
                        {domains.map(d => (
                            <Select.Option key={d.domain_name} value={d.domain_name}>
                                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{d.domain_name}</span>
                                {d.is_verified
                                    ? <Tag color="success" style={{ marginLeft: 8, fontSize: 10 }}>Verified</Tag>
                                    : <Tag color="warning" style={{ marginLeft: 8, fontSize: 10 }}>Pending</Tag>}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
                {!activeDomain && (
                    <Tag color="warning" icon={<WarningOutlined />} style={{ flexShrink: 0 }}>
                        Select a domain to see exact DNS records
                    </Tag>
                )}
                {activeDomain && (
                    <Tag color="success" icon={<CheckCircleOutlined />} style={{ flexShrink: 0, fontFamily: 'monospace' }}>
                        {activeDomain}
                    </Tag>
                )}
            </div>

            <Alert type="info" showIcon message="Email Authentication — SPF · DKIM · DMARC"
                description="These global settings control how CloudMTA handles authentication for all outgoing messages. Per-domain settings are also available in the Domains section."
                style={{ marginBottom: 24 }} />

            {/* ── SPF ── */}
            <Section icon={<SafetyCertificateOutlined />} title="SPF (Sender Policy Framework)" subtitle="Validates that your server is authorised to send for a domain">
                <ToggleRow label="SPF Checking (Inbound)" desc="Verify SPF record of incoming connections"
                    checked={authConfig?.spf_check_enabled} onChange={(v) => toggleAuth('spf_enabled', v)} />
                <DnsRecordBox
                    label="TXT record — add to DNS for"
                    domain={domainPlaceholder}
                    dnsName={domainPlaceholder}
                    type="TXT"
                    value={spfRecord}
                    onCopy={copyToClipboard}
                    dim={!activeDomain}
                />
            </Section>
            <Divider />

            {/* ── DKIM ── */}
            <Section icon={<SafetyCertificateOutlined />} title="DKIM (DomainKeys Identified Mail)" subtitle="Adds a cryptographic signature to outbound messages">
                <ToggleRow label="DKIM Signing (Outbound)" desc="Cryptographically sign all outgoing messages"
                    checked={authConfig?.dkim_signing_enabled} onChange={(v) => toggleAuth('dkim_enabled', v)} />
                <DnsRecordBox
                    label="TXT record name (DKIM public key goes here)"
                    domain={domainPlaceholder}
                    dnsName={dkimDnsName}
                    type="TXT"
                    value="v=DKIM1; k=rsa; p=<public-key> — view per-domain key in Domains → DNS Setup → DKIM"
                    onCopy={copyToClipboard}
                    dim={!activeDomain}
                    note="The actual DKIM public key is generated per domain. Go to Domains → DNS Setup → DKIM tab to copy your full TXT record."
                />
            </Section>
            <Divider />

            {/* ── DMARC ── */}
            <Section icon={<SafetyCertificateOutlined />} title="DMARC" subtitle="Policy for how receivers handle failed SPF/DKIM">
                <ToggleRow label="DMARC Checking (Inbound)" desc="Apply DMARC policy to incoming messages"
                    checked={authConfig?.dmarc_enabled} onChange={(v) => toggleAuth('dmarc_enabled', v)} />
                <DnsRecordBox
                    label="TXT record — add to DNS for"
                    domain={`_dmarc.${domainPlaceholder}`}
                    dnsName={`_dmarc.${domainPlaceholder}`}
                    type="TXT"
                    value={dmarcRecord}
                    onCopy={copyToClipboard}
                    dim={!activeDomain}
                    note="Policy options: none (monitor only) → quarantine → reject (strictest). Start with 'none' while testing, then tighten once you confirm SPF and DKIM are passing."
                />
                {!activeDomain && (
                    <Alert type="warning" showIcon style={{ marginTop: 12 }}
                        message="Select a domain above to generate the exact DMARC record for your domain." />
                )}
            </Section>
            <Divider />

            {/* ── TLS ── */}
            <Section icon={<GlobalOutlined />} title="TLS / Encryption" subtitle="Transport layer security for SMTP connections">
                <ToggleRow label="Prefer TLS (STARTTLS)" desc="Upgrade connections to TLS when available" checked={deliveryConfig?.tls_preferred ?? true} />
                <ToggleRow label="Require TLS" desc="Reject connections that cannot upgrade to TLS" checked={deliveryConfig?.tls_required ?? false} />
                <ToggleRow label="Verify TLS Certificate" desc="Strictly validate remote server's TLS certificate" checked={deliveryConfig?.verify_tls_cert ?? false} />
            </Section>
        </div>
        );
    };

    const renderDelivery = () => (
        <div>
            <Alert type="info" showIcon message="Delivery & Retry Configuration — PowerMTA-style queue management"
                description="Configure retry schedules, connection pools, and delivery behaviour. Failed messages are automatically queued and retried on an exponential backoff schedule."
                style={{ marginBottom: 24 }} />

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
                        {[
                            { label: 'Max Delivery Attempts', name: 'max_delivery_attempts', min: 1, max: 100, suffix: 'tries' },
                            { label: 'Connection Timeout', name: 'connection_timeout_seconds', min: 5, max: 120, suffix: 'sec' },
                            { label: 'Data Timeout', name: 'data_timeout_seconds', min: 10, max: 600, suffix: 'sec' },
                            { label: 'Recipients per Connection', name: 'max_recipients_per_connection', min: 1, max: 5000, suffix: 'rcpts' },
                            { label: 'Messages per Connection', name: 'max_messages_per_connection', min: 1, max: 10000, suffix: 'msgs' },
                            { label: 'Concurrent Conns / Domain', name: 'concurrent_connections_per_domain', min: 1, max: 100, suffix: 'conns' },
                        ].map(f => (
                            <Col xs={24} sm={12} md={8} key={f.name}>
                                <Form.Item label={f.label} name={f.name}>
                                    <InputNumber min={f.min} max={f.max} style={{ width: '100%' }} addonAfter={f.suffix} />
                                </Form.Item>
                            </Col>
                        ))}
                        <Col xs={24} sm={12} md={8}>
                            <Form.Item label="Backoff Strategy" name="backoff_strategy">
                                <Select style={{ width: '100%' }}>
                                    <Select.Option value="exponential">Exponential (recommended)</Select.Option>
                                    <Select.Option value="linear">Linear</Select.Option>
                                    <Select.Option value="fixed">Fixed Interval</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Form.Item label="EHLO Hostname" name="ehlo_hostname">
                                <Input placeholder={getDisplayHostname(serverInfo) || 'mail.yourdomain.com'} />
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
                        <div key={q.level} style={{ flex: '1 1 180px', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', background: '#fff' }}>
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
    );

    const renderBounce = () => (
        <div>
            <Alert type="warning" showIcon message="Bounce & Feedback Loop Management"
                description="Proper bounce handling is critical for maintaining sender reputation and avoiding blacklisting. Amazon SES and major ISPs monitor bounce and complaint rates closely."
                style={{ marginBottom: 24 }} />

            <Section icon={<WarningOutlined />} title="Bounce Thresholds" subtitle="Industry-standard limits to protect your sender reputation">
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    {[
                        { label: 'Hard Bounce Rate', warning: '2%', critical: '5%', color: C.danger, desc: 'Invalid addresses' },
                        { label: 'Soft Bounce Rate', warning: '5%', critical: '10%', color: C.warning, desc: 'Temp failures, mailbox full' },
                        { label: 'Spam Complaint Rate', warning: '0.1%', critical: '0.3%', color: '#f59e0b', desc: 'FBL complaints from ISPs' },
                    ].map(b => (
                        <Col xs={24} sm={8} key={b.label}>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', background: '#fff' }}>
                                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#0f172a' }}>{b.label}</div>
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
                                    <Select.Option value="unsubscribe">Auto-unsubscribe (recommended)</Select.Option>
                                    <Select.Option value="flag">Flag for review</Select.Option>
                                    <Select.Option value="delete">Delete address</Select.Option>
                                    <Select.Option value="none">None (log only)</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item label="Soft Bounce Max Retries" name="soft_bounce_max_retries">
                                <InputNumber min={1} max={20} style={{ width: '100%' }} addonAfter="tries" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item label={<span>Complaint Threshold <Tooltip title="Trigger suppression at this % complaint rate"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>} name="complaint_threshold_percent">
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
                <ToggleRow label="FBL Processing" desc="Automatically process abuse@ complaints from ISP feedback loops" checked={bounceConfig?.fbl_processing_enabled ?? true} />
                <ToggleRow label="Auto-Suppress on Bounce" desc="Automatically add hard-bounced addresses to suppression list" checked={bounceConfig?.auto_suppress_on_bounce ?? true} />
                <ToggleRow label="Bounce Tracking" desc="Track and record all bounce events in the database" checked={bounceConfig?.bounce_tracking_enabled ?? true} />
                <div style={{ marginTop: 14, padding: '12px 14px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 12, color: '#92400e' }}>
                        <strong>FBL Registration:</strong> Register your domain with major ISP FBL programs:{' '}
                        <a href="https://postmaster.google.com" target="_blank" rel="noopener noreferrer">Google Postmaster</a>
                        {' · '}
                        <a href="https://sendersupport.olc.protection.outlook.com/snds/" target="_blank" rel="noopener noreferrer">Microsoft SNDS</a>
                        {' · '}
                        <a href="https://postmaster.yahoo.com" target="_blank" rel="noopener noreferrer">Yahoo Postmaster</a>
                    </div>
                </div>
            </Section>
        </div>
    );

    const renderReputation = () => (
        <div>
            <Alert type="info" showIcon message="Sender Reputation Management"
                description="Monitor your sending IPs and domains across major blacklists and reputation services."
                style={{ marginBottom: 24 }} />

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
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {item.ok ? <CheckCircleOutlined style={{ color: C.success, fontSize: 16 }} /> : <CloseCircleOutlined style={{ color: C.danger, fontSize: 16 }} />}
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
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
                        Your server IP: <code style={{ fontWeight: 700, color: C.primary }}>{serverInfo?.public_ipv4 || 'Not detected'}</code>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {[
                            { name: 'MXToolbox', url: `https://mxtoolbox.com/blacklists.aspx${serverInfo?.public_ipv4 ? `?domain=${serverInfo.public_ipv4}` : ''}` },
                            { name: 'MultiRBL', url: `https://multirbl.valli.org/lookup/${serverInfo?.public_ipv4 || ''}.html` },
                            { name: 'SpamHaus', url: 'https://check.spamhaus.org/' },
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
        </div>
    );

    const renderWarmup = () => (
        <div>
            <Alert type="info" showIcon
                message="IP Warmup Schedule — SES / GreenArrow Sending Ramp-Up"
                description="New IPs must be warmed up gradually before sending at full volume. CloudMTA enforces daily sending limits per IP and automatically raises them according to your warmup schedule."
                style={{ marginBottom: 24 }} />

            {/* Warmup Stages Overview */}
            <div style={{ marginBottom: 24, padding: '16px 20px', background: '#fafbff', border: '1px solid #e0e7ff', borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5', marginBottom: 14 }}>
                    <RocketOutlined style={{ marginRight: 6 }} />Default Warmup Ramp
                </div>
                <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
                    {WARMUP_STAGES.map((stage, i) => (
                        <div key={stage.label} style={{ flex: '1 1 80px', textAlign: 'center', position: 'relative' }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%', margin: '0 auto 8px',
                                background: `linear-gradient(135deg, ${C.primary}, #7c3aed)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 700, fontSize: 12,
                                position: 'relative', zIndex: 1
                            }}>{i + 1}</div>
                            {i < WARMUP_STAGES.length - 1 && (
                                <div style={{
                                    position: 'absolute', top: 18, left: '50%', right: '-50%',
                                    height: 2, background: '#e0e7ff', zIndex: 0
                                }} />
                            )}
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{stage.label}</div>
                            <div style={{ fontSize: 11, color: C.primary, fontWeight: 600 }}>
                                {stage.limit ? stage.limit.toLocaleString() : '∞'}/day
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Active Warmup Schedules</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{warmupSchedules.length} IP{warmupSchedules.length !== 1 ? 's' : ''} in warmup</div>
                </div>
                <Button type="primary" icon={<PlusOutlined />}
                    onClick={() => { warmupForm.resetFields(); setWarmupModal({ open: true, editing: null }); }}
                    size="large">
                    Add IP Warmup Schedule
                </Button>
            </div>

            {warmupSchedules.length === 0 ? (
                <EmptyState
                    icon={<RocketOutlined />}
                    title="No warmup schedules configured"
                    desc="Add a warmup schedule to gradually ramp up sending volume on new IPs, following SES and GreenArrow best practices."
                    action={
                        <Button type="primary" icon={<PlusOutlined />}
                            onClick={() => { warmupForm.resetFields(); setWarmupModal({ open: true, editing: null }); }}>
                            Add IP Warmup Schedule
                        </Button>
                    }
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {warmupSchedules.map(schedule => (
                        <WarmupCard
                            key={schedule.id}
                            schedule={schedule}
                            onEdit={(s) => {
                                warmupForm.setFieldsValue({ ip_address: s.ip_address, is_active: s.is_active, notes: s.notes });
                                setWarmupModal({ open: true, editing: s });
                            }}
                            onDelete={async (s) => {
                                await axios.delete(`/api/v1/smtp/warmup/${s.id}`);
                                setWarmupSchedules(p => p.filter(x => x.id !== s.id));
                                message.success('Schedule deleted');
                            }}
                            onToggle={async (s) => {
                                try {
                                    await axios.put(`/api/v1/smtp/warmup/${s.id}`, { is_active: !s.is_active });
                                    setWarmupSchedules(p => p.map(x => x.id === s.id ? { ...x, is_active: !s.is_active } : x));
                                    message.success(s.is_active ? 'Warmup paused' : 'Warmup resumed');
                                } catch (e) {
                                    message.error('Failed to update');
                                }
                            }}
                        />
                    ))}
                </div>
            )}

            <Modal
                open={warmupModal.open}
                title={warmupModal.editing ? 'Edit Warmup Schedule' : 'New IP Warmup Schedule'}
                onCancel={() => setWarmupModal({ open: false, editing: null })}
                onOk={async () => {
                    const vals = await warmupForm.validateFields();
                    try {
                        if (warmupModal.editing) {
                            await axios.put(`/api/v1/smtp/warmup/${warmupModal.editing.id}`, vals);
                            message.success('Schedule updated');
                        } else {
                            await axios.post('/api/v1/smtp/warmup', vals);
                            message.success('Warmup schedule created');
                        }
                        setWarmupModal({ open: false, editing: null });
                        const res = await axios.get('/api/v1/smtp/warmup');
                        setWarmupSchedules(res.data || []);
                    } catch (e) {
                        message.error(e.response?.data?.detail || 'Failed to save');
                    }
                }}
                destroyOnClose
            >
                <Form form={warmupForm} layout="vertical" style={{ marginTop: 16 }}>
                    {!warmupModal.editing && (
                        <>
                            <Form.Item label="IP Address" name="ip_address" rules={[{ required: true }]}>
                                <Input placeholder="203.0.113.10" />
                            </Form.Item>
                            <Form.Item label="Start Date" name="start_date" tooltip="Leave blank to start today">
                                <Input type="date" />
                            </Form.Item>
                        </>
                    )}
                    <Form.Item label="Active" name="is_active" valuePropName="checked" initialValue={true}>
                        <Switch />
                    </Form.Item>
                    <Form.Item label="Notes" name="notes">
                        <Input.TextArea rows={2} placeholder="Optional notes about this IP" />
                    </Form.Item>
                    <Alert type="info" showIcon
                        message="Default Schedule: Day 1→200, Day 3→500, Day 7→1,000, Day 14→5,000, Day 30→20,000, Day 60→Unlimited"
                        style={{ fontSize: 12 }} />
                </Form>
            </Modal>
        </div>
    );

    const renderRouting = () => (
        <div>
            <Alert type="info" showIcon message="Virtual MTA Routing — PowerMTA-style email routing"
                description="Define rules to route outbound email to specific IP addresses or virtual MTA pools based on sender domain, recipient domain, or message priority. Rules are evaluated in priority order."
                style={{ marginBottom: 24 }} />

            <Section icon={<ApiOutlined />} title="Routing Rules"
                subtitle={`${routingRules.length} rule${routingRules.length !== 1 ? 's' : ''} defined`}
                extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setRoutingModal({ open: true, editing: null })}>Add Rule</Button>}
            >
                {routingRules.length === 0 ? (
                    <EmptyState icon={<ApiOutlined />} title="No routing rules defined"
                        desc="All mail uses default routing. Add rules to route by domain or priority."
                        action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setRoutingModal({ open: true, editing: null })}>Add Rule</Button>} />
                ) : (
                    <Table dataSource={routingRules} rowKey="id" size="small" pagination={false}
                        columns={[
                            { title: 'Order', dataIndex: 'priority_order', width: 70, render: v => <Tag style={{ fontFamily: 'monospace' }}>#{v}</Tag> },
                            { title: 'Rule Name', dataIndex: 'name', render: (v, r) => (
                                <div><div style={{ fontWeight: 600 }}>{v}</div>{r.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.description}</div>}</div>
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
                            { title: 'Status', dataIndex: 'is_active', width: 80, render: v => <Badge status={v ? 'success' : 'default'} text={v ? 'Active' : 'Off'} /> },
                            { title: '', width: 100, render: (_, r) => (
                                <Space>
                                    <Button size="small" onClick={() => setRoutingModal({ open: true, editing: r })}>Edit</Button>
                                    <Button size="small" danger onClick={async () => {
                                        await axios.delete(`/api/v1/smtp/routing-rules/${r.id}`);
                                        setRoutingRules(p => p.filter(x => x.id !== r.id));
                                        message.success('Rule deleted');
                                    }}>Del</Button>
                                </Space>
                            )},
                        ]}
                    />
                )}
            </Section>

            <RoutingRuleModal open={routingModal.open} editing={routingModal.editing} ipPool={ipPool}
                onClose={() => setRoutingModal({ open: false, editing: null })}
                onSaved={(rule) => {
                    if (routingModal.editing) setRoutingRules(p => p.map(r => r.id === rule.id ? { ...r, ...rule } : r));
                    else setRoutingRules(p => [...p, rule]);
                    setRoutingModal({ open: false, editing: null });
                }} />
        </div>
    );

    const renderISPProfiles = () => (
        <div>
            <Alert type="info" showIcon message="ISP Traffic Shaping Profiles — PowerMTA-style per-ISP throttling"
                description="Pre-built connection and rate limits for major ISPs. Applying a profile creates a Routing Rule targeting that ISP's domain with industry-recommended limits."
                style={{ marginBottom: 24 }} />
            {ispProfiles.length === 0 ? (
                <EmptyState icon={<GlobalOutlined />} title="No ISP profiles available" desc="ISP profiles will appear here once loaded from the server." />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {ispProfiles.map((profile) => (
                        <div key={profile.isp} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff', flexShrink: 0 }}>
                                    <GlobalOutlined style={{ fontSize: 18 }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{profile.name}</div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{profile.description}</div>
                                    <Space wrap>
                                        <Tag>Max Connections: {profile.max_connections}</Tag>
                                        <Tag>Rate: {profile.rate_limit_per_second} msg/s</Tag>
                                        <Tag>Strategy: {profile.retry_strategy}</Tag>
                                    </Space>
                                    {profile.notes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{profile.notes}</div>}
                                </div>
                            </div>
                            <Popconfirm title={`Apply ${profile.name} throttle profile as a routing rule?`}
                                onConfirm={async () => {
                                    try {
                                        const res = await axios.post('/api/v1/smtp/isp-profiles/apply', { isp: profile.isp });
                                        message.success(`Profile applied — Routing Rule #${res.data.routing_rule_id} created`);
                                        const rr = await axios.get('/api/v1/smtp/routing-rules');
                                        setRoutingRules(rr.data || []);
                                    } catch (e) {
                                        message.error(e.response?.data?.detail || 'Failed');
                                    }
                                }}>
                                <Button type="primary" size="small" icon={<CheckCircleOutlined />}>Apply Profile</Button>
                            </Popconfirm>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderWebhooks = () => (
        <div>
            <Alert type="info" showIcon message="Event Webhooks — GreenArrow-style HTTP event delivery"
                description="Receive real-time HTTP POST notifications for delivery events. Each webhook is secured with an HMAC-SHA256 signature header."
                style={{ marginBottom: 24 }} />

            <Section icon={<CloudOutlined />} title="Webhook Endpoints"
                subtitle={`${webhooks.length} endpoint${webhooks.length !== 1 ? 's' : ''} configured`}
                extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setWebhookModal({ open: true, editing: null })}>Add Webhook</Button>}
            >
                {webhooks.length === 0 ? (
                    <EmptyState icon={<CloudOutlined />} title="No webhooks configured"
                        desc="Add an endpoint to receive real-time delivery event notifications."
                        action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setWebhookModal({ open: true, editing: null })}>Add Webhook</Button>} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {webhooks.map(wh => (
                            <div key={wh.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', background: wh.is_active ? '#fff' : '#f8fafc' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{wh.name}</div>
                                        <code style={{ fontSize: 12, color: C.primary, wordBreak: 'break-all' }}>{wh.url}</code>
                                    </div>
                                    <Space>
                                        <Badge status={wh.is_active ? 'success' : 'default'} text={wh.is_active ? 'Active' : 'Paused'} />
                                        <Button size="small" onClick={async () => {
                                            try { await axios.post(`/api/v1/smtp/webhooks/${wh.id}/test`); message.success('Test ping sent'); }
                                            catch (e) { message.error(e.response?.data?.detail || 'Test failed'); }
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
                                        <Tag key={ev} color={ev === 'bounce' ? 'error' : ev === 'complaint' ? 'warning' :
                                            ev === 'delivery' ? 'success' : ev === 'open' ? 'processing' : 'default'}>{ev}</Tag>
                                    ))}
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                    Sent: {wh.total_deliveries} · Failed: {wh.total_failures}
                                    {wh.last_triggered_at && ` · Last: ${new Date(wh.last_triggered_at).toLocaleString()}`}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <WebhookModal open={webhookModal.open} editing={webhookModal.editing}
                onClose={() => setWebhookModal({ open: false, editing: null })}
                onSaved={(hook) => {
                    if (webhookModal.editing) setWebhooks(p => p.map(w => w.id === hook.id ? { ...w, ...hook } : w));
                    else setWebhooks(p => [...p, hook]);
                    setWebhookModal({ open: false, editing: null });
                }} />
        </div>
    );

    const renderTracking = () => {
        const displayHostname = getDisplayHostname(serverInfo);
        const trackingDomain = authDomain.trim() || 'yourdomain.com';
        const cnameTarget = displayHostname || 'your-mail-server-hostname';
        return (
        <div>
            {!displayHostname && (
                <Alert type="warning" showIcon style={{ marginBottom: 16 }}
                    message="Hostname not configured"
                    description={
                        <span>
                            CNAME target cannot be determined — set <code>SMTP_HOSTNAME</code> to your server's FQDN (e.g.{' '}
                            <code>mail.yourdomain.com</code>) so the tracking CNAME record shows the correct target.
                        </span>
                    }
                />
            )}
            <Alert type="info" showIcon message="Open & Click Tracking — Transparent pixel tracking"
                description="CloudMTA injects a 1×1 tracking pixel to detect email opens and rewrites links for click tracking."
                style={{ marginBottom: 24 }} />

            <Section icon={<EyeOutlined />} title="Open Tracking" subtitle="Detect when recipients open your emails">
                <ToggleRow label="Enable Open Tracking" desc="Inject a 1×1 pixel at the bottom of HTML emails to record opens"
                    checked={trackingConfig?.open_tracking_enabled ?? false}
                    onChange={async (v) => {
                        setTrackingConfig(p => ({ ...p, open_tracking_enabled: v }));
                        await axios.put('/api/v1/smtp/tracking', { open_tracking_enabled: v });
                        message.success('Open tracking ' + (v ? 'enabled' : 'disabled'));
                    }} />
                <ToggleRow label="Track Plain-Text Emails" desc="Plain-text messages cannot embed pixels — only HTML emails are tracked"
                    checked={trackingConfig?.track_plain_text ?? false} disabled />
            </Section>
            <Divider />

            <Section icon={<LinkOutlined />} title="Click Tracking" subtitle="Rewrite links to record when recipients click">
                <ToggleRow label="Enable Click Tracking" desc="All hyperlinks in HTML emails are rewritten through the tracking redirect"
                    checked={trackingConfig?.click_tracking_enabled ?? false}
                    onChange={async (v) => {
                        setTrackingConfig(p => ({ ...p, click_tracking_enabled: v }));
                        await axios.put('/api/v1/smtp/tracking', { click_tracking_enabled: v });
                        message.success('Click tracking ' + (v ? 'enabled' : 'disabled'));
                    }} />
                <ToggleRow label="Unsubscribe Tracking" desc="Track when recipients click the unsubscribe link"
                    checked={trackingConfig?.unsubscribe_tracking ?? true} />
            </Section>
            <Divider />

            <Section icon={<GlobalOutlined />} title="Tracking Domain" subtitle="Custom subdomain used for tracking pixels and click redirects">
                <Row gutter={[12, 0]} align="middle">
                    <Col flex="auto">
                        <Input value={trackingConfig?.tracking_domain || ''}
                            onChange={e => setTrackingConfig(p => ({ ...p, tracking_domain: e.target.value }))}
                            placeholder="track.yourdomain.com" addonBefore="https://" />
                    </Col>
                    <Col>
                        <Button type="primary" icon={<SaveOutlined />} onClick={async () => {
                            await axios.put('/api/v1/smtp/tracking', { tracking_domain: trackingConfig?.tracking_domain });
                            message.success('Tracking domain saved');
                        }}>Save</Button>
                    </Col>
                </Row>
                <DnsRecordBox
                    label="CNAME record — point your tracking subdomain to"
                    domain={`track.${trackingDomain}`}
                    dnsName={`track.${trackingDomain}`}
                    type="CNAME"
                    value={cnameTarget}
                    onCopy={copyToClipboard}
                    dim={!authDomain.trim() || !displayHostname}
                    note={!authDomain.trim() ? 'Select a domain in the Authentication tab to populate this record.' : undefined}
                />
            </Section>
        </div>
        );
    };

    const renderSimulator = () => (
        <div>
            <Alert type="info" showIcon message="Mailbox Simulator — Amazon SES Mailbox Simulator equivalent"
                description="Test your sending pipeline without sending to real addresses. Simulate delivery, bounces, complaints, and out-of-office responses."
                style={{ marginBottom: 24 }} />
            <Row gutter={[16, 16]}>
                <Col xs={24} md={10}>
                    <Card title="Run Simulation" bordered={false}>
                        <Form form={simulatorForm} layout="vertical">
                            <Form.Item label="From Email" name="from_email" rules={[{ required: true, type: 'email' }]}>
                                <Input placeholder="sender@yourdomain.com" />
                            </Form.Item>
                            <Form.Item label="Scenario" name="scenario" rules={[{ required: true }]}>
                                <Select placeholder="Choose a scenario">
                                    {simulatorScenarios.map(s => (
                                        <Select.Option key={s.id} value={s.id}>
                                            {s.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                            <Button type="primary" icon={<AimOutlined />} loading={simulatorRunning}
                                onClick={async () => {
                                    const vals = await simulatorForm.validateFields();
                                    setSimulatorRunning(true);
                                    try {
                                        const res = await axios.post('/api/v1/smtp/simulator/test', vals);
                                        setSimulatorResult(res.data);
                                    } catch (e) {
                                        message.error(e.response?.data?.detail || 'Simulation failed');
                                    } finally { setSimulatorRunning(false); }
                                }} block>
                                Run Simulation
                            </Button>
                        </Form>
                    </Card>
                </Col>
                <Col xs={24} md={14}>
                    {simulatorResult ? (
                        <Card title={<span><ExperimentOutlined style={{ marginRight: 6 }} />Simulation Result</span>} bordered={false}
                            extra={<Tag color={simulatorResult.expected_final_status === 'sent' ? 'success' :
                                simulatorResult.expected_final_status === 'bounced' ? 'error' : 'warning'}>
                                {simulatorResult.expected_final_status?.toUpperCase()}</Tag>}>
                            <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#0f172a', color: '#e2e8f0', borderRadius: 8, padding: 14 }}>
                                <div><span style={{ color: '#94a3b8' }}>Message-ID: </span>{simulatorResult.simulation_id}</div>
                                <div><span style={{ color: '#94a3b8' }}>From: </span>{simulatorResult.from_email}</div>
                                <div><span style={{ color: '#94a3b8' }}>To: </span>{simulatorResult.to_email}</div>
                                <div><span style={{ color: '#94a3b8' }}>SMTP: </span><span style={{ color: '#4ade80' }}>{simulatorResult.simulated_smtp_response}</span></div>
                                <div><span style={{ color: '#94a3b8' }}>DKIM: </span>{simulatorResult.dkim_signed ? '✓ Signed' : '✗ Unsigned'}</div>
                                <div><span style={{ color: '#94a3b8' }}>SPF: </span>{simulatorResult.spf_pass ? '✓ Pass' : '✗ Fail'}</div>
                                <div><span style={{ color: '#94a3b8' }}>DMARC: </span>{simulatorResult.dmarc_pass ? '✓ Pass' : '✗ Fail'}</div>
                            </div>
                            {simulatorResult.recommendations?.length > 0 && (
                                <Alert type="warning" style={{ marginTop: 12 }} message="Recommendations"
                                    description={<ul style={{ margin: 0, paddingLeft: 16 }}>
                                        {simulatorResult.recommendations.map((r, i) => <li key={i} style={{ fontSize: 12 }}>{r}</li>)}
                                    </ul>} />
                            )}
                        </Card>
                    ) : (
                        <Card title="Available Scenarios" bordered={false}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {simulatorScenarios.map(s => (
                                    <div key={s.id} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                                            {s.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>{s.description}</div>
                                    </div>
                                ))}
                                {simulatorScenarios.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading scenarios…</div>}
                            </div>
                        </Card>
                    )}
                </Col>
            </Row>
        </div>
    );

    const renderConfigSets = () => (
        <div>
            <Alert type="info" showIcon message="Configuration Sets — Amazon SES-style email grouping"
                description="Group your emails by category and apply per-set tracking, routing, and reputation thresholds. Reference a set by name in the X-Configuration-Set header."
                style={{ marginBottom: 24 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <Button type="primary" icon={<PlusOutlined />}
                    onClick={() => { configSetForm.resetFields(); setConfigSetModal({ open: true, editing: null }); }}>
                    New Configuration Set
                </Button>
            </div>
            {configSets.length === 0 ? (
                <EmptyState icon={<AppstoreOutlined />} title="No configuration sets"
                    desc="Create a configuration set to group emails by type or campaign."
                    action={<Button type="primary" icon={<PlusOutlined />}
                        onClick={() => { configSetForm.resetFields(); setConfigSetModal({ open: true, editing: null }); }}>
                        New Configuration Set
                    </Button>} />
            ) : (
                <Table dataSource={configSets} rowKey="id" size="small" pagination={false}
                    columns={[
                        { title: 'Name', dataIndex: 'name', key: 'name', render: v => <strong>{v}</strong> },
                        { title: 'Description', dataIndex: 'description', key: 'desc', render: v => <span style={{ color: '#64748b', fontSize: 12 }}>{v || '—'}</span> },
                        { title: 'Open Track', dataIndex: 'open_tracking_enabled', key: 'open', render: v => v === null ? <Tag>Inherit</Tag> : <Tag color={v ? 'success' : 'default'}>{v ? 'On' : 'Off'}</Tag> },
                        { title: 'Click Track', dataIndex: 'click_tracking_enabled', key: 'click', render: v => v === null ? <Tag>Inherit</Tag> : <Tag color={v ? 'success' : 'default'}>{v ? 'On' : 'Off'}</Tag> },
                        { title: 'Max Bounce', dataIndex: 'max_bounce_rate', key: 'bounce', render: v => <Tag color="orange">{(v * 100).toFixed(1)}%</Tag> },
                        { title: 'Sending', dataIndex: 'sending_enabled', key: 'sending', render: v => <Tag color={v ? 'success' : 'error'}>{v ? 'Enabled' : 'Paused'}</Tag> },
                        { title: 'Actions', key: 'actions', render: (_, r) => (
                            <Space>
                                <Button size="small" onClick={() => { configSetForm.setFieldsValue(r); setConfigSetModal({ open: true, editing: r }); }}>Edit</Button>
                                <Popconfirm title="Delete this configuration set?"
                                    onConfirm={async () => {
                                        await axios.delete(`/api/v1/smtp/configuration-sets/${r.id}`);
                                        setConfigSets(p => p.filter(x => x.id !== r.id));
                                        message.success('Configuration set deleted');
                                    }}>
                                    <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            </Space>
                        )},
                    ]} />
            )}

            <Modal open={configSetModal.open} title={configSetModal.editing ? 'Edit Configuration Set' : 'New Configuration Set'}
                onCancel={() => setConfigSetModal({ open: false, editing: null })} width={560}
                onOk={async () => {
                    const vals = await configSetForm.validateFields();
                    try {
                        if (configSetModal.editing) {
                            await axios.put(`/api/v1/smtp/configuration-sets/${configSetModal.editing.id}`, vals);
                            message.success('Updated');
                        } else {
                            await axios.post('/api/v1/smtp/configuration-sets', vals);
                            message.success('Configuration set created');
                        }
                        setConfigSetModal({ open: false, editing: null });
                        const res = await axios.get('/api/v1/smtp/configuration-sets');
                        setConfigSets(res.data || []);
                    } catch (e) {
                        message.error(e.response?.data?.detail || 'Failed to save');
                    }
                }} destroyOnClose>
                <Form form={configSetForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item label="Name" name="name" rules={[{ required: true }]}>
                        <Input placeholder="transactional" />
                    </Form.Item>
                    <Form.Item label="Description" name="description">
                        <Input placeholder="Transactional emails — receipts, password resets, etc." />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item label="Open Tracking" name="open_tracking_enabled" tooltip="null = inherit global setting">
                                <Select allowClear placeholder="Inherit global">
                                    <Select.Option value={true}>Enabled</Select.Option>
                                    <Select.Option value={false}>Disabled</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="Click Tracking" name="click_tracking_enabled">
                                <Select allowClear placeholder="Inherit global">
                                    <Select.Option value={true}>Enabled</Select.Option>
                                    <Select.Option value={false}>Disabled</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item label="Max Bounce Rate" name="max_bounce_rate" initialValue={0.10} tooltip="Auto-pause sending when exceeded">
                                <InputNumber min={0} max={1} step={0.01} style={{ width: '100%' }} formatter={v => `${(v * 100).toFixed(1)}%`} parser={v => parseFloat(v) / 100} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="Max Complaint Rate" name="max_complaint_rate" initialValue={0.001}>
                                <InputNumber min={0} max={0.1} step={0.0001} style={{ width: '100%' }} formatter={v => `${(v * 100).toFixed(3)}%`} parser={v => parseFloat(v) / 100} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item label="Sending Enabled" name="sending_enabled" valuePropName="checked" initialValue={true}>
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );

    const RENDERERS = {
        server: renderServer,
        ip: renderIP,
        smtp: renderSMTP,
        auth: renderAuth,
        delivery: renderDelivery,
        bounce: renderBounce,
        reputation: renderReputation,
        warmup: renderWarmup,
        routing: renderRouting,
        'isp-profiles': renderISPProfiles,
        webhooks: renderWebhooks,
        tracking: renderTracking,
        simulator: renderSimulator,
        'config-sets': renderConfigSets,
    };

    const activeNav = NAV_GROUPS.flatMap(g => g.items).find(i => i.key === activeTab);

    return (
        <div className="content-wrapper">
            {/* Page header */}
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Server configuration, IP rotation, authentication, and sender reputation</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {serverInfo?.public_ipv4 ? (
                        <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontFamily: 'monospace', fontSize: 13, padding: '4px 10px' }}>
                            {serverInfo.public_ipv4}
                        </Tag>
                    ) : (
                        <Tag color="warning" icon={<WarningOutlined />}>IP not detected</Tag>
                    )}
                    <Button icon={<ReloadOutlined />} onClick={fetchAll}>Refresh</Button>
                </div>
            </div>

            {/* Settings layout: sidebar + content */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Sidebar navigation */}
                <div style={{
                    width: 210, flexShrink: 0, background: '#fff', borderRadius: 12,
                    border: '1px solid #e2e8f0', padding: '8px 0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'sticky', top: 80
                }}>
                    {NAV_GROUPS.map((group, gi) => (
                        <div key={group.label}>
                            {gi > 0 && <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />}
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, padding: '8px 16px 4px' }}>
                                {group.label}
                            </div>
                            {group.items.map(item => (
                                <button
                                    key={item.key}
                                    onClick={() => setActiveTab(item.key)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        width: '100%', padding: '8px 16px', border: 'none',
                                        background: activeTab === item.key ? `${C.primary}12` : 'transparent',
                                        color: activeTab === item.key ? C.primary : '#475569',
                                        fontWeight: activeTab === item.key ? 600 : 400,
                                        fontSize: 13, cursor: 'pointer', borderRadius: 0,
                                        textAlign: 'left', transition: 'all 0.15s',
                                        borderLeft: activeTab === item.key ? `3px solid ${C.primary}` : '3px solid transparent',
                                    }}
                                    onMouseEnter={e => { if (activeTab !== item.key) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#0f172a'; }}}
                                    onMouseLeave={e => { if (activeTab !== item.key) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; }}}
                                >
                                    <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Content area */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Card
                        bordered={false}
                        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                        bodyStyle={{ padding: '24px 28px' }}
                        title={
                            activeNav && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8, background: `${C.primary}15`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primary, fontSize: 15
                                    }}>{activeNav.icon}</div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', lineHeight: 1.2 }}>{activeNav.label}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>
                                            {NAV_GROUPS.find(g => g.items.some(i => i.key === activeTab))?.label}
                                        </div>
                                    </div>
                                </div>
                            )
                        }
                    >
                        {RENDERERS[activeTab]?.() || null}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
