import React, { useState, useEffect, useCallback } from 'react';
import {
    Card, Table, Button, Input, Select, Tag, Space, Modal, Form,
    message, Spin, Alert, Row, Col, Statistic, Tooltip, Badge, Popconfirm
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, SearchOutlined, DownloadOutlined,
    UploadOutlined, MailOutlined, ExclamationCircleOutlined,
    CheckCircleOutlined, StopOutlined, ReloadOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { TextArea } = Input;

const REASON_CONFIG = {
    hard_bounce: { color: 'error', label: 'Hard Bounce', desc: 'Permanent delivery failure — invalid address' },
    soft_bounce: { color: 'warning', label: 'Soft Bounce', desc: 'Temporary failure exceeded retry limit' },
    complaint: { color: 'red', label: 'Spam Complaint', desc: 'Recipient marked as spam via FBL' },
    spam: { color: 'red', label: 'Spam', desc: 'Flagged as spam' },
    unsubscribe: { color: 'orange', label: 'Unsubscribed', desc: 'Recipient opted out' },
    manual: { color: 'default', label: 'Manual', desc: 'Manually added by admin' },
};

// ──────────────────────────────────────────────
//  Add Suppression Modal
// ──────────────────────────────────────────────
const AddSuppressionModal = ({ open, onClose, onAdded }) => {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    const handleOk = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            // Support bulk paste — split by newlines/commas
            const emails = values.emails
                .split(/[\n,;]+/)
                .map(e => e.trim())
                .filter(Boolean);

            const res = await axios.post('/api/v1/suppressions', {
                emails,
                reason: values.reason,
                reason_detail: values.reason_detail,
            });
            const { added, skipped } = res.data;
            message.success(`${added.length} address(es) added${skipped.length ? `, ${skipped.length} skipped` : ''}`);
            form.resetFields();
            onAdded();
            onClose();
        } catch (e) {
            message.error(e.response?.data?.detail || 'Failed to add suppression');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title="Add to Suppression List"
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            width={520}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item
                    label="Email Address(es)"
                    name="emails"
                    rules={[{ required: true, message: 'Enter at least one email address' }]}
                    extra="Paste multiple addresses separated by newlines, commas, or semicolons."
                >
                    <TextArea
                        rows={5}
                        placeholder={`user@example.com\nanother@domain.com`}
                    />
                </Form.Item>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item label="Reason" name="reason" initialValue="manual" rules={[{ required: true }]}>
                            <Select>
                                {Object.entries(REASON_CONFIG).map(([k, v]) => (
                                    <Option key={k} value={k}>
                                        <Tag color={v.color} style={{ marginRight: 4 }}>{v.label}</Tag>
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="Note (optional)" name="reason_detail">
                            <Input placeholder="Additional context" />
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Modal>
    );
};

// ──────────────────────────────────────────────
//  Check Email Modal
// ──────────────────────────────────────────────
const CheckEmailModal = ({ open, onClose }) => {
    const [email, setEmail] = useState('');
    const [result, setResult] = useState(null);
    const [checking, setChecking] = useState(false);

    const check = async () => {
        if (!email.trim()) return;
        setChecking(true);
        setResult(null);
        try {
            const res = await axios.get('/api/v1/suppressions/check', { params: { email: email.trim() } });
            setResult(res.data);
        } catch (e) {
            message.error('Check failed');
        } finally {
            setChecking(false);
        }
    };

    return (
        <Modal
            open={open}
            title="Check Email Address"
            onCancel={() => { onClose(); setEmail(''); setResult(null); }}
            footer={null}
            width={480}
        >
            <div style={{ marginTop: 16 }}>
                <Input.Search
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onSearch={check}
                    placeholder="Enter email address to check"
                    enterButton="Check"
                    loading={checking}
                    prefix={<MailOutlined />}
                />
                {result && (
                    <div style={{ marginTop: 16 }}>
                        {result.suppressed ? (
                            <Alert
                                type="error"
                                showIcon
                                icon={<StopOutlined />}
                                message={`${result.email} is suppressed`}
                                description={
                                    <div>
                                        <div>Reason: <Tag color={REASON_CONFIG[result.reason]?.color || 'default'}>{REASON_CONFIG[result.reason]?.label || result.reason}</Tag></div>
                                        {result.added_at && <div style={{ fontSize: 12, marginTop: 4 }}>Added: {new Date(result.added_at).toLocaleString()}</div>}
                                    </div>
                                }
                            />
                        ) : (
                            <Alert
                                type="success"
                                showIcon
                                icon={<CheckCircleOutlined />}
                                message={`${result.email} is NOT suppressed`}
                                description="This address can receive emails."
                            />
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

// ──────────────────────────────────────────────
//  Main Suppressions Page
// ──────────────────────────────────────────────
const SuppressionsPage = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ items: [], total: 0 });
    const [stats, setStats] = useState({});
    const [pagination, setPagination] = useState({ current: 1, pageSize: 50 });
    const [filters, setFilters] = useState({ reason: null, search: '' });
    const [selectedRows, setSelectedRows] = useState([]);
    const [addModal, setAddModal] = useState(false);
    const [checkModal, setCheckModal] = useState(false);

    const fetchData = useCallback(async (page = 1, pageSize = 50, reason = null, search = '') => {
        setLoading(true);
        try {
            const params = {
                skip: (page - 1) * pageSize,
                limit: pageSize,
            };
            if (reason) params.reason = reason;
            if (search) params.search = search;

            const [listRes, statsRes] = await Promise.allSettled([
                axios.get('/api/v1/suppressions', { params }),
                axios.get('/api/v1/suppressions/stats'),
            ]);

            if (listRes.status === 'fulfilled') setData(listRes.value.data);
            if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(pagination.current, pagination.pageSize, filters.reason, filters.search);
    }, [fetchData, pagination.current, pagination.pageSize, filters.reason, filters.search]);

    const handleDelete = async (id) => {
        await axios.delete(`/api/v1/suppressions/${id}`);
        message.success('Removed from suppression list');
        fetchData(pagination.current, pagination.pageSize, filters.reason, filters.search);
    };

    const handleBulkDelete = async () => {
        if (!selectedRows.length) return;
        Modal.confirm({
            title: `Remove ${selectedRows.length} suppression(s)?`,
            icon: <ExclamationCircleOutlined />,
            content: 'These addresses will be able to receive email again.',
            okText: 'Remove',
            okType: 'danger',
            onOk: async () => {
                await axios.delete('/api/v1/suppressions', { data: { ids: selectedRows } });
                message.success(`${selectedRows.length} suppression(s) removed`);
                setSelectedRows([]);
                fetchData(pagination.current, pagination.pageSize, filters.reason, filters.search);
            },
        });
    };

    const columns = [
        {
            title: 'Email Address',
            dataIndex: 'email',
            render: v => (
                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    <MailOutlined style={{ marginRight: 6, color: '#94a3b8' }} />{v}
                </span>
            ),
        },
        {
            title: 'Reason',
            dataIndex: 'reason',
            width: 160,
            render: v => {
                const cfg = REASON_CONFIG[v] || { color: 'default', label: v };
                return (
                    <Tooltip title={cfg.desc}>
                        <Tag color={cfg.color}>{cfg.label}</Tag>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Source',
            dataIndex: 'source',
            width: 120,
            render: v => <Tag style={{ fontSize: 11 }}>{v || 'manual'}</Tag>,
        },
        {
            title: 'Note',
            dataIndex: 'reason_detail',
            render: v => v ? <span style={{ fontSize: 12, color: '#64748b' }}>{v}</span> : null,
        },
        {
            title: 'Date Added',
            dataIndex: 'created_at',
            width: 160,
            render: v => v ? <span style={{ fontSize: 12 }}>{new Date(v).toLocaleString()}</span> : '—',
            sorter: false,
        },
        {
            title: '',
            width: 90,
            render: (_, record) => (
                <Popconfirm
                    title="Remove this suppression?"
                    description="This address will be able to receive email again."
                    onConfirm={() => handleDelete(record.id)}
                    okText="Remove"
                    okType="danger"
                >
                    <Button size="small" danger icon={<DeleteOutlined />}>Remove</Button>
                </Popconfirm>
            ),
        },
    ];

    return (
        <div className="content-wrapper">
            {/* Header */}
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title">Suppression List</h1>
                    <p className="page-subtitle">
                        Manage email addresses that will not receive messages — hard bounces, spam complaints, and manual blocks
                    </p>
                </div>
                <Space>
                    <Button icon={<SearchOutlined />} onClick={() => setCheckModal(true)}>Check Email</Button>
                    <Button icon={<ReloadOutlined />} onClick={() => fetchData(pagination.current, pagination.pageSize, filters.reason, filters.search)} />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>
                        Add Suppression
                    </Button>
                </Space>
            </div>

            {/* Stats Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                        <Statistic title="Total Suppressed" value={stats.total || 0} valueStyle={{ color: '#0f172a', fontSize: 22 }} />
                    </Card>
                </Col>
                {Object.entries(stats.by_reason || {}).map(([reason, count]) => {
                    const cfg = REASON_CONFIG[reason] || { label: reason };
                    return (
                        <Col xs={12} sm={6} key={reason}>
                            <Card size="small" style={{ textAlign: 'center' }}>
                                <Statistic
                                    title={cfg.label}
                                    value={count}
                                    valueStyle={{ fontSize: 22, color:
                                        reason === 'hard_bounce' ? '#ef4444' :
                                        reason === 'complaint' || reason === 'spam' ? '#f59e0b' :
                                        reason === 'unsubscribe' ? '#f97316' : '#64748b'
                                    }}
                                />
                            </Card>
                        </Col>
                    );
                })}
            </Row>

            {/* Industry Info */}
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 20 }}
                message="Industry thresholds — Amazon SES & ISP Guidelines"
                description={
                    <div style={{ fontSize: 12 }}>
                        Keep hard bounce rate below <strong>2%</strong> and spam complaint rate below <strong>0.1%</strong>.
                        Exceeding these thresholds risks account suspension or IP blacklisting.
                        CloudMTA auto-suppresses hard bounces and FBL complaints.
                    </div>
                }
            />

            {/* Main Table */}
            <Card
                size="small"
                title={
                    <Space>
                        <StopOutlined />
                        Suppressed Addresses
                        <Badge count={data.total} style={{ backgroundColor: '#ef4444' }} showZero />
                    </Space>
                }
                extra={
                    <Space>
                        {selectedRows.length > 0 && (
                            <Button danger size="small" icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                                Remove {selectedRows.length} selected
                            </Button>
                        )}
                        <Select
                            allowClear
                            placeholder="Filter by reason"
                            style={{ width: 170 }}
                            value={filters.reason}
                            onChange={v => { setFilters(p => ({ ...p, reason: v || null })); setPagination(p => ({ ...p, current: 1 })); }}
                        >
                            {Object.entries(REASON_CONFIG).map(([k, v]) => (
                                <Option key={k} value={k}>{v.label}</Option>
                            ))}
                        </Select>
                        <Input.Search
                            placeholder="Search email..."
                            allowClear
                            style={{ width: 220 }}
                            onSearch={v => { setFilters(p => ({ ...p, search: v })); setPagination(p => ({ ...p, current: 1 })); }}
                        />
                    </Space>
                }
            >
                <Table
                    loading={loading}
                    dataSource={data.items}
                    columns={columns}
                    rowKey="id"
                    rowSelection={{
                        selectedRowKeys: selectedRows,
                        onChange: setSelectedRows,
                    }}
                    pagination={{
                        current: pagination.current,
                        pageSize: pagination.pageSize,
                        total: data.total,
                        showSizeChanger: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} entries`,
                        onChange: (page, size) => setPagination({ current: page, pageSize: size }),
                    }}
                    locale={{
                        emptyText: (
                            <div style={{ padding: '40px 0', color: '#94a3b8' }}>
                                <CheckCircleOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block', color: '#10b981' }} />
                                <div>Suppression list is empty</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>All addresses can receive email. Bounces and complaints will be auto-added.</div>
                            </div>
                        )
                    }}
                />
            </Card>

            <AddSuppressionModal
                open={addModal}
                onClose={() => setAddModal(false)}
                onAdded={() => fetchData(pagination.current, pagination.pageSize, filters.reason, filters.search)}
            />
            <CheckEmailModal open={checkModal} onClose={() => setCheckModal(false)} />
        </div>
    );
};

export default SuppressionsPage;
