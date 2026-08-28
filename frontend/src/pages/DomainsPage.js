import React, { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, Select, message, Card, Spin, Space,
    Tag, Tooltip, Tabs, Divider, Alert, Badge
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, SafetyCertificateOutlined,
    CopyOutlined, CheckCircleOutlined, CloseCircleOutlined,
    GlobalOutlined, LoadingOutlined, InfoCircleOutlined,
    SyncOutlined, ExclamationCircleOutlined, SwapOutlined, UserOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { ReloadOutlined } from '@ant-design/icons';

const DNS_HELP = {
    spf: {
        title: 'SPF Record (TXT)',
        desc: 'SPF tells receiving servers which IPs are allowed to send email on behalf of your domain.',
        type: 'TXT',
        nameTemplate: (domain) => domain,
        valueTemplate: () => 'v=spf1 mx a ~all'
    },
    dkim: {
        title: 'DKIM Record (TXT)',
        desc: 'DKIM adds a cryptographic signature to outgoing emails so recipients can verify authenticity.',
        type: 'TXT',
        nameTemplate: (domain, selector = 'default') => `${selector}._domainkey.${domain}`,
        valueTemplate: (pubKey) => pubKey ? `v=DKIM1; k=rsa; p=${pubKey}` : 'Generated after domain creation'
    },
    dmarc: {
        title: 'DMARC Record (TXT) — Optional',
        desc: 'DMARC tells receivers what to do with emails that fail SPF/DKIM validation. Not required for domain verification.',
        type: 'TXT',
        nameTemplate: (domain) => `_dmarc.${domain}`,
        valueTemplate: (domain) => `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; ruf=mailto:dmarc@${domain}; pct=100`
    },
    mx: {
        title: 'MX Record',
        desc: 'MX records define the mail server responsible for receiving emails for your domain.',
        type: 'MX',
        nameTemplate: (domain) => domain,
        valueTemplate: (domain) => `10 mail.${domain}`
    }
};

const StatusBadge = ({ verified, label }) => {
    if (verified === true) return <Tag color="success" icon={<CheckCircleOutlined />}>{label} ✓</Tag>;
    if (verified === false) return <Tag color="error" icon={<CloseCircleOutlined />}>{label} ✗</Tag>;
    return <Tag color="default" icon={<ExclamationCircleOutlined />}>{label} ?</Tag>;
};

const CopyBox = ({ text, label }) => {
    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            message.success(`${label} copied to clipboard`);
        }).catch(() => {
            message.error('Copy failed — please copy manually');
        });
    };
    return (
        <div style={{ position: 'relative' }}>
            <div className="dns-record-box" style={{ paddingRight: 44 }}>{text}</div>
            <Tooltip title="Copy">
                <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={handleCopy}
                    style={{
                        position: 'absolute', top: 6, right: 6,
                        color: '#7dd3fc', background: 'rgba(255,255,255,0.08)',
                        borderRadius: 4
                    }}
                />
            </Tooltip>
        </div>
    );
};

const DnsSection = ({ title, desc, name, value, verified, optional }) => (
    <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
                {optional && <Tag color="default" style={{ fontSize: 11 }}>Optional</Tag>}
            </div>
            {verified !== undefined && (
                verified
                    ? <Tag color="success" icon={<CheckCircleOutlined />}>Verified</Tag>
                    : optional
                        ? <Tag color="default" icon={<ExclamationCircleOutlined />}>Not Set</Tag>
                        : <Tag color="warning" icon={<ExclamationCircleOutlined />}>Not Verified</Tag>
            )}
        </div>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>{desc}</p>
        <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Hostname</span>
            <CopyBox text={name} label="Hostname" />
        </div>
        <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Value</span>
            <CopyBox text={value} label="Value" />
        </div>
    </div>
);

const DomainsPage = ({ user }) => {
    const isAdmin = user?.role === 'admin';
    const [loading, setLoading] = useState(true);
    const [domains, setDomains] = useState([]);
    const [users, setUsers] = useState([]);
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [verifyModalVisible, setVerifyModalVisible] = useState(false);
    const [assignModal, setAssignModal] = useState({ open: false, domain: null });
    const [assignSaving, setAssignSaving] = useState(false);
    const [selectedDomain, setSelectedDomain] = useState(null);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyResult, setVerifyResult] = useState(null);
    const [generatedSpf, setGeneratedSpf] = useState(null);
    const [spfGenerating, setSpfGenerating] = useState(false);
    const [form] = Form.useForm();
    const [assignForm] = Form.useForm();

    useEffect(() => {
        fetchDomains();
        if (isAdmin) fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchDomains = async () => {
        try {
            const response = await axios.get('/api/v1/domains/');
            setDomains(response.data || []);
        } catch {
            message.error('Failed to load domains');
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/v1/users/', { params: { limit: 100 } });
            setUsers(res.data || []);
        } catch {
            // non-fatal: owner selection just won't be available
        }
    };

    const handleAddDomain = async (values) => {
        try {
            await axios.post('/api/v1/domains/', values);
            message.success('Domain added — configure DNS records to start sending');
            setAddModalVisible(false);
            form.resetFields();
            fetchDomains();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to add domain');
        }
    };

    const openAssignModal = (domain) => {
        setAssignModal({ open: true, domain });
        assignForm.setFieldsValue({ owner_id: domain.owner_id });
    };

    const handleAssignOwner = async (values) => {
        setAssignSaving(true);
        try {
            await axios.post(`/api/v1/domains/${assignModal.domain.id}/assign`, values);
            message.success('Domain owner updated');
            setAssignModal({ open: false, domain: null });
            fetchDomains();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to assign domain owner');
        } finally {
            setAssignSaving(false);
        }
    };

    const handleDeleteDomain = (domainId, domainName) => {
        Modal.confirm({
            title: `Delete "${domainName}"?`,
            content: 'This will permanently remove the domain and its DNS keys. This action cannot be undone.',
            okText: 'Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            icon: <ExclamationCircleOutlined style={{ color: '#ef4444' }} />,
            onOk: async () => {
                try {
                    await axios.delete(`/api/v1/domains/${domainId}`);
                    message.success('Domain deleted');
                    fetchDomains();
                } catch {
                    message.error('Failed to delete domain');
                }
            }
        });
    };

    const openVerifyModal = async (domain) => {
        setSelectedDomain(domain);
        setVerifyResult(null);
        setGeneratedSpf(null);
        setVerifyModalVisible(true);
    };

    const generateSpf = async () => {
        if (!selectedDomain) return;
        setSpfGenerating(true);
        try {
            const res = await axios.get(`/api/v1/smtp/domains/${selectedDomain.id}/generate-spf`);
            setGeneratedSpf(res.data.spf_record);
            message.success('SPF record generated with your server\'s real IP addresses');
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to generate SPF record');
        } finally {
            setSpfGenerating(false);
        }
    };

    const runDnsVerification = async () => {
        if (!selectedDomain) return;
        setVerifyLoading(true);
        try {
            const res = await axios.get(`/api/v1/domains/${selectedDomain.id}/verify-dns`);
            setVerifyResult(res.data);
            fetchDomains();
            if (res.data?.spf?.verified) {
                message.success('SPF verified — domain is active! DKIM and DMARC are optional but recommended.');
            } else {
                message.warning('SPF not yet verified. DNS propagation can take up to 48 hours after adding the TXT record.');
            }
        } catch (err) {
            message.error(err.response?.data?.detail || 'DNS verification failed');
        } finally {
            setVerifyLoading(false);
        }
    };

    const getStatusTag = (domain) => {
        const s = domain.status;
        if (s === 'active') return <Tag color="success">Active</Tag>;
        if (s === 'verification_pending') return <Tag color="warning">Pending</Tag>;
        if (s === 'suspended') return <Tag color="error">Suspended</Tag>;
        return <Tag color="default">{s}</Tag>;
    };

    const columns = [
        {
            title: 'Domain',
            dataIndex: 'domain_name',
            key: 'domain_name',
            render: (text) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GlobalOutlined style={{ color: '#4f46e5', fontSize: 14 }} />
                    <span style={{ fontWeight: 600 }}>{text}</span>
                </div>
            )
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (_, record) => getStatusTag(record)
        },
        ...(isAdmin ? [{
            title: 'Owner',
            dataIndex: 'owner_username',
            key: 'owner_username',
            render: (v, record) => (
                <Tooltip title={record.owner_email}>
                    <span><UserOutlined style={{ marginRight: 4, color: '#64748b' }} />{v || `User #${record.owner_id}`}</span>
                </Tooltip>
            )
        }] : []),
        {
            title: 'SPF',
            dataIndex: 'spf_verified',
            key: 'spf_verified',
            render: (v) => v ? <Badge status="success" text="Verified" /> : <Badge status="warning" text="Pending" />
        },
        {
            title: 'DKIM',
            dataIndex: 'dkim_enabled',
            key: 'dkim_enabled',
            render: (v) => v ? <Badge status="success" text="Enabled" /> : <Badge status="default" text="Disabled" />
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="primary"
                        size="small"
                        icon={<SafetyCertificateOutlined />}
                        onClick={() => openVerifyModal(record)}
                    >
                        DNS Setup
                    </Button>
                    {isAdmin && (
                        <Button
                            size="small"
                            icon={<SwapOutlined />}
                            onClick={() => openAssignModal(record)}
                        >
                            Assign Owner
                        </Button>
                    )}
                    <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteDomain(record.id, record.domain_name)}
                    >
                        Delete
                    </Button>
                </Space>
            )
        }
    ];

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
    }

    // DNS verification modal content
    const dnsTabItems = selectedDomain ? [
        {
            key: 'spf',
            label: (
                <span>
                    {verifyResult?.spf?.verified ? <CheckCircleOutlined style={{ color: '#10b981' }} /> : <ExclamationCircleOutlined style={{ color: '#f59e0b' }} />}
                    &nbsp;SPF <Tag color="red" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>Required</Tag>
                </span>
            ),
            children: (
                <div>
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            size="small"
                            type="primary"
                            icon={spfGenerating ? <LoadingOutlined /> : <ReloadOutlined />}
                            loading={spfGenerating}
                            onClick={generateSpf}
                        >
                            Generate SPF with Real IPs
                        </Button>
                    </div>
                    <DnsSection
                        title={DNS_HELP.spf.title}
                        desc={DNS_HELP.spf.desc}
                        name={DNS_HELP.spf.nameTemplate(selectedDomain.domain_name)}
                        value={generatedSpf || selectedDomain.spf_record || DNS_HELP.spf.valueTemplate()}
                        verified={verifyResult?.spf?.verified}
                    />
                    {!generatedSpf && (
                        <Alert
                            type="info" showIcon
                            message={'Click "Generate SPF with Real IPs" to auto-detect your server\'s public IP address and build an accurate SPF record.'}
                            style={{ marginTop: 8 }}
                        />
                    )}
                </div>
            )
        },
        {
            key: 'dkim',
            label: (
                <span>
                    {verifyResult?.dkim?.verified ? <CheckCircleOutlined style={{ color: '#10b981' }} /> : <ExclamationCircleOutlined style={{ color: '#f59e0b' }} />}
                    &nbsp;DKIM
                </span>
            ),
            children: (
                <DnsSection
                    title={DNS_HELP.dkim.title}
                    desc={DNS_HELP.dkim.desc}
                    name={DNS_HELP.dkim.nameTemplate(selectedDomain.domain_name, selectedDomain.dkim_selector || 'default')}
                    value={DNS_HELP.dkim.valueTemplate(selectedDomain.dkim_public_key)}
                    verified={verifyResult?.dkim?.verified}
                />
            )
        },
        {
            key: 'dmarc',
            label: (
                <span>
                    {verifyResult?.dmarc?.verified ? <CheckCircleOutlined style={{ color: '#10b981' }} /> : <ExclamationCircleOutlined style={{ color: '#f59e0b' }} />}
                    &nbsp;DMARC
                </span>
            ),
            children: (
                <DnsSection
                    title={DNS_HELP.dmarc.title}
                    desc={DNS_HELP.dmarc.desc}
                    name={DNS_HELP.dmarc.nameTemplate(selectedDomain.domain_name)}
                    value={DNS_HELP.dmarc.valueTemplate(selectedDomain.domain_name)}
                    verified={verifyResult?.dmarc?.verified}
                    optional
                />
            )
        },
        {
            key: 'mx',
            label: <span><InfoCircleOutlined />&nbsp;MX</span>,
            children: (
                <DnsSection
                    title={DNS_HELP.mx.title}
                    desc={DNS_HELP.mx.desc}
                    name={DNS_HELP.mx.nameTemplate(selectedDomain.domain_name)}
                    value={DNS_HELP.mx.valueTemplate(selectedDomain.domain_name)}
                    optional
                />
            )
        }
    ] : [];

    return (
        <div className="content-wrapper">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <h1 className="page-title">Domains</h1>
                    <p className="page-subtitle">Manage sending domains and DNS verification</p>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="large"
                    onClick={() => setAddModalVisible(true)}
                >
                    Add Domain
                </Button>
            </div>

            <Card>
                <Table
                    columns={columns}
                    dataSource={domains}
                    rowKey="id"
                    pagination={{ pageSize: 10, showTotal: (t) => `${t} domains` }}
                    locale={{ emptyText: 'No domains added yet. Click "Add Domain" to get started.' }}
                    size="middle"
                />
            </Card>

            {/* Add Domain Modal */}
            <Modal
                title={<span><PlusOutlined /> Add New Domain</span>}
                open={addModalVisible}
                onCancel={() => { setAddModalVisible(false); form.resetFields(); }}
                footer={null}
                width={480}
            >
                <Alert
                    type="info"
                    showIcon
                    message="After adding your domain, you'll need to configure DNS records (SPF, DKIM, DMARC) to enable email sending."
                    style={{ marginBottom: 20, marginTop: 12 }}
                />
                <Form form={form} layout="vertical" onFinish={handleAddDomain}>
                    <Form.Item
                        label="Domain Name"
                        name="domain_name"
                        rules={[
                            { required: true, message: 'Please enter domain name' },
                            {
                                pattern: /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
                                message: 'Invalid domain format (e.g. example.com)'
                            }
                        ]}
                    >
                        <Input
                            prefix={<GlobalOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="example.com"
                            size="large"
                        />
                    </Form.Item>
                    {isAdmin && (
                        <Form.Item
                            label="Owner"
                            name="owner_id"
                            tooltip="Defaults to your own account if left blank"
                        >
                            <Select
                                allowClear
                                placeholder="Assign to a user (defaults to you)"
                                options={users.map(u => ({ value: u.id, label: `${u.username} (${u.email})` }))}
                            />
                        </Form.Item>
                    )}
                    <Form.Item style={{ marginBottom: 0 }}>
                        <Button type="primary" block htmlType="submit" size="large">Add Domain</Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Assign Owner Modal */}
            <Modal
                title={<span><SwapOutlined /> Assign Domain Owner — <span style={{ color: '#4f46e5' }}>{assignModal.domain?.domain_name}</span></span>}
                open={assignModal.open}
                onCancel={() => setAssignModal({ open: false, domain: null })}
                footer={null}
                width={440}
            >
                <Form form={assignForm} layout="vertical" onFinish={handleAssignOwner} style={{ marginTop: 16 }}>
                    <Form.Item
                        label="Owner"
                        name="owner_id"
                        rules={[{ required: true, message: 'Please select an owner' }]}
                    >
                        <Select
                            placeholder="Select a user"
                            options={users.map(u => ({ value: u.id, label: `${u.username} (${u.email})` }))}
                        />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setAssignModal({ open: false, domain: null })}>Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={assignSaving}>Save</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* DNS Setup & Verification Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <SafetyCertificateOutlined style={{ color: '#4f46e5', fontSize: 18 }} />
                        <span>DNS Setup & Verification — <span style={{ color: '#4f46e5' }}>{selectedDomain?.domain_name}</span></span>
                    </div>
                }
                open={verifyModalVisible}
                onCancel={() => { setVerifyModalVisible(false); setVerifyResult(null); setGeneratedSpf(null); }}
                width={700}
                footer={[
                    <Button key="close" onClick={() => { setVerifyModalVisible(false); setVerifyResult(null); setGeneratedSpf(null); }}>
                        Close
                    </Button>,
                    <Button
                        key="verify"
                        type="primary"
                        icon={verifyLoading ? <LoadingOutlined /> : <SyncOutlined />}
                        loading={verifyLoading}
                        onClick={runDnsVerification}
                    >
                        Verify DNS Records
                    </Button>
                ]}
            >
                <Alert
                    type="warning"
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                    message="DNS propagation can take 24–48 hours after making changes with your DNS provider."
                    style={{ marginBottom: 20 }}
                />

                {verifyResult && (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{
                            display: 'flex', gap: 8, flexWrap: 'wrap',
                            background: '#f8fafc', padding: '12px 16px', borderRadius: 8,
                            border: '1px solid #e2e8f0'
                        }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginRight: 4 }}>Verification Results:</span>
                            <StatusBadge verified={verifyResult?.spf?.verified} label="SPF (Required)" />
                            <StatusBadge verified={verifyResult?.dkim?.verified} label="DKIM (Optional)" />
                            <StatusBadge verified={verifyResult?.dmarc?.verified} label="DMARC (Optional)" />
                        </div>
                    </div>
                )}

                <Alert
                    type="info"
                    showIcon
                    message={<span><strong>SPF is required</strong> to verify your domain and start sending. DKIM and DMARC are optional but strongly recommended for deliverability.</span>}
                    style={{ marginBottom: 12 }}
                />
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                    Add the DNS records below to your domain registrar or DNS provider. Copy each value exactly as shown.
                </p>

                <Tabs items={dnsTabItems} />
            </Modal>
        </div>
    );
};

export default DomainsPage;

