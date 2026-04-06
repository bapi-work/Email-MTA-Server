import React, { useState, useEffect, useCallback } from 'react';
import {
    Card, Row, Col, Statistic, Button, Spin, Alert, Progress, Tag, Divider,
    Typography, List, Space, Select, Tabs, Tooltip, Table, Empty
} from 'antd';
import {
    ReloadOutlined, SafetyOutlined, WarningOutlined, CheckCircleOutlined,
    CloseCircleOutlined, InfoCircleOutlined, RiseOutlined, FallOutlined,
    DashboardOutlined, BulbOutlined, GlobalOutlined
} from '@ant-design/icons';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RTooltip, ResponsiveContainer, Legend
} from 'recharts';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// ─── Score helpers ────────────────────────────────────────────────────────────
const gradeColor = (score) => {
    if (score >= 90) return '#52c41a';
    if (score >= 75) return '#1677ff';
    if (score >= 50) return '#faad14';
    if (score >= 25) return '#ff7a45';
    return '#f5222d';
};

const gradeStatus = (score) => {
    if (score >= 90) return 'success';
    if (score >= 75) return 'normal';
    if (score >= 50) return 'normal';
    return 'exception';
};

const severityColor = {
    success: '#52c41a',
    info: '#1677ff',
    warning: '#faad14',
    critical: '#f5222d',
};

const severityIcon = {
    success: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    info: <InfoCircleOutlined style={{ color: '#1677ff' }} />,
    warning: <WarningOutlined style={{ color: '#faad14' }} />,
    critical: <CloseCircleOutlined style={{ color: '#f5222d' }} />,
};

// ─── Score Gauge component ────────────────────────────────────────────────────
const ScoreGauge = ({ score, grade }) => (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <Progress
            type="dashboard"
            percent={score}
            size={180}
            strokeColor={gradeColor(score)}
            status={gradeStatus(score)}
            format={() => (
                <div>
                    <div style={{ fontSize: 36, fontWeight: 700, color: gradeColor(score) }}>{score}</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{grade}</div>
                </div>
            )}
        />
        <div style={{ marginTop: 8 }}>
            <Tag color={score >= 75 ? 'success' : score >= 50 ? 'warning' : 'error'} style={{ fontSize: 13, padding: '2px 10px' }}>
                {grade} Sender Reputation
            </Tag>
        </div>
    </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const ReputationPage = () => {
    const [loading, setLoading] = useState(true);
    const [score, setScore] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [domainHealth, setDomainHealth] = useState([]);
    const [period, setPeriod] = useState(7);
    const [error, setError] = useState(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [scoreRes, dashRes, recRes, domRes] = await Promise.all([
                axios.get(`/api/v1/reputation/score?days=${period}`),
                axios.get(`/api/v1/reputation/dashboard?days=30`),
                axios.get('/api/v1/reputation/recommendations'),
                axios.get('/api/v1/reputation/domain-health'),
            ]);
            setScore(scoreRes.data);
            setDashboard(dashRes.data);
            setRecommendations(recRes.data.recommendations || []);
            setDomainHealth(domRes.data.domains || []);
        } catch (e) {
            setError(e.response?.data?.detail || 'Failed to load reputation data');
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const domainColumns = [
        {
            title: 'Domain',
            dataIndex: 'domain',
            key: 'domain',
            render: (d) => <Text strong>{d}</Text>,
        },
        {
            title: 'Score',
            dataIndex: 'score',
            key: 'score',
            render: (s) => (
                <Space>
                    <Progress percent={s} size="small" style={{ width: 80 }} strokeColor={gradeColor(s)} showInfo={false} />
                    <Text style={{ color: gradeColor(s) }}>{s}</Text>
                </Space>
            ),
        },
        {
            title: 'Auth',
            key: 'auth',
            render: (_, r) => (
                <Space>
                    <Tooltip title="SPF"><Tag color={r.authentication.spf_verified ? 'success' : 'default'}>SPF</Tag></Tooltip>
                    <Tooltip title="DKIM"><Tag color={r.authentication.dkim_enabled ? 'success' : 'default'}>DKIM</Tag></Tooltip>
                    <Tooltip title="DMARC"><Tag color={r.authentication.dmarc_enabled ? 'success' : 'default'}>DMARC</Tag></Tooltip>
                </Space>
            ),
        },
        {
            title: 'Sent (7d)',
            dataIndex: ['metrics_7d', 'total_sent'],
            key: 'sent',
            render: (v) => v?.toLocaleString() || 0,
        },
        {
            title: 'Bounce Rate',
            dataIndex: ['metrics_7d', 'bounce_rate'],
            key: 'bounce',
            render: (v) => {
                const val = v || 0;
                return <Text type={val >= 5 ? 'danger' : val >= 2 ? 'warning' : 'success'}>{val.toFixed(2)}%</Text>;
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (s, r) => (
                <Tag color={r.is_verified ? 'success' : 'warning'}>
                    {r.is_verified ? 'Verified' : 'Unverified'}
                </Tag>
            ),
        },
    ];

    if (loading && !score) {
        return (
            <div style={{ textAlign: 'center', padding: 60 }}>
                <Spin size="large" tip="Loading reputation data..." />
            </div>
        );
    }

    return (
        <div style={{ padding: '0 4px' }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}>
                        <DashboardOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                        Reputation Dashboard
                    </Title>
                    <Text type="secondary">Virtual Deliverability Manager — monitor sender health & ISP reputation</Text>
                </div>
                <Space>
                    <Select value={period} onChange={setPeriod} style={{ width: 130 }}>
                        <Option value={7}>Last 7 days</Option>
                        <Option value={14}>Last 14 days</Option>
                        <Option value={30}>Last 30 days</Option>
                    </Select>
                    <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>Refresh</Button>
                </Space>
            </div>

            {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

            {/* ── Top Row: Score + Key Metrics ── */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} md={6}>
                    <Card bordered={false} style={{ height: '100%' }}>
                        {score && <ScoreGauge score={score.score} grade={score.grade} />}
                    </Card>
                </Col>
                <Col xs={24} md={18}>
                    <Row gutter={[16, 16]}>
                        <Col xs={12} sm={6}>
                            <Card bordered={false}>
                                <Statistic
                                    title="Total Sent"
                                    value={score?.metrics?.total_sent || 0}
                                    prefix={<RiseOutlined />}
                                    valueStyle={{ color: '#1677ff' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6}>
                            <Card bordered={false}>
                                <Statistic
                                    title="Delivery Rate"
                                    value={score?.metrics?.delivery_rate || 0}
                                    suffix="%"
                                    prefix={<CheckCircleOutlined />}
                                    valueStyle={{ color: '#52c41a' }}
                                    precision={2}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6}>
                            <Card bordered={false}>
                                <Statistic
                                    title="Bounce Rate"
                                    value={score?.metrics?.bounce_rate || 0}
                                    suffix="%"
                                    prefix={<FallOutlined />}
                                    valueStyle={{
                                        color: (score?.metrics?.bounce_rate || 0) >= 5 ? '#f5222d' :
                                            (score?.metrics?.bounce_rate || 0) >= 2 ? '#faad14' : '#52c41a'
                                    }}
                                    precision={3}
                                />
                                <Text type="secondary" style={{ fontSize: 11 }}>Threshold: &lt;2.0% healthy</Text>
                            </Card>
                        </Col>
                        <Col xs={12} sm={6}>
                            <Card bordered={false}>
                                <Statistic
                                    title="Complaint Rate"
                                    value={score?.metrics?.complaint_rate || 0}
                                    suffix="%"
                                    prefix={<WarningOutlined />}
                                    valueStyle={{
                                        color: (score?.metrics?.complaint_rate || 0) >= 0.1 ? '#f5222d' :
                                            (score?.metrics?.complaint_rate || 0) >= 0.05 ? '#faad14' : '#52c41a'
                                    }}
                                    precision={4}
                                />
                                <Text type="secondary" style={{ fontSize: 11 }}>Threshold: &lt;0.05% healthy</Text>
                            </Card>
                        </Col>
                        <Col xs={12} sm={6}>
                            <Card bordered={false}>
                                <Statistic
                                    title="Delivered"
                                    value={score?.metrics?.delivered || 0}
                                    valueStyle={{ color: '#52c41a' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6}>
                            <Card bordered={false}>
                                <Statistic
                                    title="Bounced"
                                    value={score?.metrics?.bounced || 0}
                                    valueStyle={{ color: score?.metrics?.bounced > 0 ? '#f5222d' : '#888' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6}>
                            <Card bordered={false}>
                                <Statistic
                                    title="Failed"
                                    value={score?.metrics?.failed || 0}
                                    valueStyle={{ color: score?.metrics?.failed > 0 ? '#faad14' : '#888' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6}>
                            <Card bordered={false}>
                                <Statistic
                                    title="Period"
                                    value={`${period}d`}
                                    prefix={<InfoCircleOutlined />}
                                    valueStyle={{ color: '#888' }}
                                />
                            </Card>
                        </Col>
                    </Row>
                </Col>
            </Row>

            <Tabs
                defaultActiveKey="trends"
                items={[
                    {
                        key: 'trends',
                        label: <><RiseOutlined /> Sending Trends</>,
                        children: (
                            <Row gutter={[16, 16]}>
                                <Col xs={24} lg={12}>
                                    <Card title="Daily Message Volume (30 days)" bordered={false}>
                                        {dashboard?.data?.length ? (
                                            <ResponsiveContainer width="100%" height={260}>
                                                <BarChart data={dashboard.data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                                                    <YAxis tick={{ fontSize: 10 }} />
                                                    <RTooltip />
                                                    <Legend />
                                                    <Bar dataKey="sent" fill="#52c41a" name="Sent" />
                                                    <Bar dataKey="bounced" fill="#f5222d" name="Bounced" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <Empty description="No data yet" />}
                                    </Card>
                                </Col>
                                <Col xs={24} lg={12}>
                                    <Card title="Bounce Rate Trend (30 days)" bordered={false}>
                                        {dashboard?.data?.length ? (
                                            <ResponsiveContainer width="100%" height={260}>
                                                <LineChart data={dashboard.data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                                                    <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 'auto']} />
                                                    <RTooltip formatter={(v) => [`${v.toFixed(3)}%`, 'Bounce Rate']} />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="bounce_rate"
                                                        stroke="#f5222d"
                                                        strokeWidth={2}
                                                        dot={false}
                                                        name="Bounce Rate"
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="delivery_rate"
                                                        stroke="#52c41a"
                                                        strokeWidth={2}
                                                        dot={false}
                                                        name="Delivery Rate"
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        ) : <Empty description="No data yet" />}
                                    </Card>
                                </Col>
                            </Row>
                        ),
                    },
                    {
                        key: 'recommendations',
                        label: (
                            <>
                                <BulbOutlined />
                                {' '}Recommendations
                                {recommendations.filter(r => r.severity === 'critical' || r.severity === 'warning').length > 0 && (
                                    <Tag color="red" style={{ marginLeft: 6, fontSize: 10 }}>
                                        {recommendations.filter(r => r.severity === 'critical' || r.severity === 'warning').length}
                                    </Tag>
                                )}
                            </>
                        ),
                        children: (
                            <List
                                dataSource={recommendations}
                                renderItem={(rec) => (
                                    <List.Item key={rec.category + rec.title}>
                                        <Card
                                            bordered={false}
                                            style={{
                                                width: '100%',
                                                borderLeft: `4px solid ${severityColor[rec.severity] || '#888'}`,
                                                marginBottom: 2,
                                            }}
                                            bodyStyle={{ padding: '12px 16px' }}
                                        >
                                            <Space align="start">
                                                <div style={{ marginTop: 2 }}>{severityIcon[rec.severity]}</div>
                                                <div>
                                                    <Text strong>{rec.title}</Text>
                                                    <Paragraph type="secondary" style={{ margin: '4px 0' }}>{rec.description}</Paragraph>
                                                    <Text style={{ color: '#1677ff', fontSize: 13 }}>
                                                        <BulbOutlined style={{ marginRight: 4 }} />
                                                        {rec.action}
                                                    </Text>
                                                </div>
                                            </Space>
                                        </Card>
                                    </List.Item>
                                )}
                            />
                        ),
                    },
                    {
                        key: 'domains',
                        label: <><GlobalOutlined /> Domain Health</>,
                        children: (
                            <Card bordered={false}>
                                <Table
                                    dataSource={domainHealth}
                                    columns={domainColumns}
                                    rowKey="domain_id"
                                    pagination={false}
                                    size="small"
                                    locale={{ emptyText: 'No domains configured. Add a domain to start monitoring.' }}
                                />
                            </Card>
                        ),
                    },
                ]}
            />
        </div>
    );
};

export default ReputationPage;
