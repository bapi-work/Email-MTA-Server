import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, message, Spin, Tag, Progress, Tooltip } from 'antd';
import {
    MailOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    RiseOutlined,
    GlobalOutlined,
    ReloadOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import axios from 'axios';

const COLORS = {
    primary: '#4f46e5',
    secondary: '#7c3aed',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6'
};

// Small gradient stat card
const StatCard = ({ icon, label, value, color, bg, trend }) => (
    <div className="stat-card-modern">
        <div className="stat-card-icon" style={{ background: bg }}>
            <span style={{ color }}>{icon}</span>
        </div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value ?? '—'}</div>
        {trend != null && (
            <div style={{ marginTop: 8, fontSize: 12, color: trend >= 0 ? COLORS.success : COLORS.danger, display: 'flex', alignItems: 'center', gap: 4 }}>
                <RiseOutlined style={{ transform: trend < 0 ? 'rotate(180deg)' : 'none' }} />
                <span>{Math.abs(trend)}% from yesterday</span>
            </div>
        )}
    </div>
);

// Generate mock hourly chart data if none returned
const generateDemoChart = () => {
    const hours = [];
    for (let h = 0; h < 24; h++) {
        const label = `${String(h).padStart(2, '0')}:00`;
        const sent = Math.floor(Math.random() * 800 + 100);
        const failed = Math.floor(Math.random() * 60);
        hours.push({ hour: label, sent, failed });
    }
    return hours;
};

const DashboardPage = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [deliveryData, setDeliveryData] = useState([]);
    const [hourlyData, setHourlyData] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = async () => {
        try {
            const [statsRes, deliveryRes, hourlyRes] = await Promise.all([
                axios.get('/api/v1/analytics/dashboard'),
                axios.get('/api/v1/analytics/delivery-by-domain'),
                axios.get('/api/v1/analytics/hourly-stats').catch(() => ({ data: { data: generateDemoChart() } }))
            ]);
            setStats(statsRes.data?.summary);
            setDeliveryData(deliveryRes.data || []);
            const hData = hourlyRes.data?.data || hourlyRes.data || [];
            setHourlyData(hData.length > 0 ? hData : generateDemoChart());
        } catch (error) {
            message.error('Failed to load dashboard data');
            setHourlyData(generateDemoChart());
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleRefresh = () => { setRefreshing(true); fetchData(); };

    const domainColumns = [
        {
            title: 'Domain',
            dataIndex: 'domain',
            key: 'domain',
            render: (text) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GlobalOutlined style={{ color: COLORS.info, fontSize: 13 }} />
                    <span style={{ fontWeight: 500 }}>{text}</span>
                </div>
            )
        },
        {
            title: 'Total',
            dataIndex: 'total_messages',
            key: 'total',
            render: (v) => <span style={{ fontWeight: 600 }}>{(v || 0).toLocaleString()}</span>
        },
        {
            title: 'Sent',
            dataIndex: 'sent',
            key: 'sent',
            render: (v) => <span style={{ color: COLORS.success, fontWeight: 600 }}>{(v || 0).toLocaleString()}</span>
        },
        {
            title: 'Failed',
            dataIndex: 'failed',
            key: 'failed',
            render: (v) => <span style={{ color: COLORS.danger, fontWeight: 600 }}>{(v || 0).toLocaleString()}</span>
        },
        {
            title: 'Success Rate',
            dataIndex: 'success_rate',
            key: 'success_rate',
            render: (val, record) => {
                const rate = val ?? (record.total_messages > 0 ? ((record.sent / record.total_messages) * 100).toFixed(1) : 100);
                const color = rate >= 90 ? COLORS.success : rate >= 70 ? COLORS.warning : COLORS.danger;
                return (
                    <div style={{ minWidth: 110 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color }}>{rate}%</span>
                        </div>
                        <Progress percent={Number(rate)} size="small" showInfo={false}
                            strokeColor={color} trailColor="#f1f5f9" />
                    </div>
                );
            }
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => {
                const rate = record.success_rate ?? 100;
                if (rate >= 90) return <Tag color="success">Healthy</Tag>;
                if (rate >= 70) return <Tag color="warning">Degraded</Tag>;
                return <Tag color="error">Critical</Tag>;
            }
        }
    ];

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="content-wrapper">
            {/* Page header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Real-time overview of your email delivery infrastructure</p>
                </div>
                <Tooltip title="Refresh">
                    <div
                        onClick={handleRefresh}
                        style={{
                            width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', background: '#fff', transition: 'background 0.2s'
                        }}
                    >
                        <ReloadOutlined spin={refreshing} style={{ color: '#64748b' }} />
                    </div>
                </Tooltip>
            </div>

            {/* Stat cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} md={6}>
                    <StatCard
                        icon={<MailOutlined />}
                        label="Total Messages"
                        value={(stats?.total_messages || 0).toLocaleString()}
                        color={COLORS.primary}
                        bg="rgba(79,70,229,0.1)"
                    />
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <StatCard
                        icon={<CheckCircleOutlined />}
                        label="Successfully Sent"
                        value={(stats?.sent || 0).toLocaleString()}
                        color={COLORS.success}
                        bg="rgba(16,185,129,0.1)"
                    />
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <StatCard
                        icon={<CloseCircleOutlined />}
                        label="Failed Deliveries"
                        value={(stats?.failed || 0).toLocaleString()}
                        color={COLORS.danger}
                        bg="rgba(239,68,68,0.1)"
                    />
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <StatCard
                        icon={<RiseOutlined />}
                        label="Success Rate"
                        value={`${stats?.success_rate?.toFixed(1) ?? '100.0'}%`}
                        color={COLORS.warning}
                        bg="rgba(245,158,11,0.1)"
                    />
                </Col>
            </Row>

            {/* Charts row */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ClockCircleOutlined style={{ color: COLORS.primary }} />
                                <span>Hourly Delivery Trend</span>
                            </div>
                        }
                        bodyStyle={{ padding: '16px 20px' }}
                    >
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={hourlyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                                <defs>
                                    <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.15} />
                                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.danger} stopOpacity={0.12} />
                                        <stop offset="95%" stopColor={COLORS.danger} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={3} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                <RechartsTooltip
                                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                                />
                                <Area type="monotone" dataKey="sent" name="Sent" stroke={COLORS.primary} strokeWidth={2} fill="url(#sentGrad)" dot={false} />
                                <Area type="monotone" dataKey="failed" name="Failed" stroke={COLORS.danger} strokeWidth={2} fill="url(#failGrad)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <GlobalOutlined style={{ color: COLORS.info }} />
                                <span>Top Domains</span>
                            </div>
                        }
                        bodyStyle={{ padding: '16px 20px' }}
                        style={{ height: '100%' }}
                    >
                        {deliveryData.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontSize: 13 }}>
                                No domain data yet
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={deliveryData.slice(0, 6)} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="domain" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                    <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                                    <Bar dataKey="sent" name="Sent" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="failed" name="Failed" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Delivery Details Table */}
            <Card
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MailOutlined style={{ color: COLORS.primary }} />
                        <span>Delivery by Domain</span>
                    </div>
                }
            >
                <Table
                    columns={domainColumns}
                    dataSource={deliveryData}
                    rowKey="domain"
                    pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (t) => `${t} domains` }}
                    locale={{ emptyText: 'No delivery data available yet' }}
                    size="middle"
                />
            </Card>
        </div>
    );
};

export default DashboardPage;

