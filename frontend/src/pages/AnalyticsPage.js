import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, message, Spin, Tabs } from 'antd';
import axios from 'axios';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const AnalyticsPage = () => {
    const [loading, setLoading] = useState(true);
    const [authStats, setAuthStats] = useState(null);
    const [deliveryStats, setDeliveryStats] = useState([]);
    const [hourlyData, setHourlyData] = useState([]);

    useEffect(() => {
        fetchAnalyticsData();
    }, []);

    const fetchAnalyticsData = async () => {
        try {
            const [authRes, deliveryRes, hourlyRes] = await Promise.all([
                axios.get('/api/v1/analytics/authentication-stats'),
                axios.get('/api/v1/analytics/delivery-by-domain'),
                axios.get('/api/v1/analytics/hourly-stats')
            ]);

            setAuthStats(authRes.data?.statistics);
            setDeliveryStats(deliveryRes.data || []);
            setHourlyData(hourlyRes.data?.data || []);
        } catch (error) {
            message.error('Failed to load analytics data');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: 'Domain',
            dataIndex: 'domain',
            key: 'domain'
        },
        {
            title: 'Total',
            dataIndex: 'total_messages',
            key: 'total'
        },
        {
            title: 'Sent',
            dataIndex: 'sent',
            key: 'sent'
        },
        {
            title: 'Success Rate',
            dataIndex: 'success_rate',
            key: 'success_rate',
            render: (text) => `${text}%`
        }
    ];

    if (loading) {
        return <Spin size="large" />;
    }

    return (
        <div className="content-wrapper">
            <h1>Analytics & Reporting</h1>
            
            <Tabs items={[
                {
                    key: 'overview',
                    label: 'Overview',
                    children: (
                        <div>
                            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                                <Col xs={24} sm={12} md={8}>
                                    <Card>
                                        <div>
                                            <div style={{ fontSize: '12px', color: '#666' }}>DKIM Signed</div>
                                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>
                                                {authStats?.dkim_signed?.percentage || 0}%
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#999' }}>
                                                {authStats?.dkim_signed?.count || 0} messages
                                            </div>
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Card>
                                        <div>
                                            <div style={{ fontSize: '12px', color: '#666' }}>SPF Verified</div>
                                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                                                {authStats?.spf_verified?.percentage || 0}%
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#999' }}>
                                                {authStats?.spf_verified?.count || 0} messages
                                            </div>
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} md={8}>
                                    <Card>
                                        <div>
                                            <div style={{ fontSize: '12px', color: '#666' }}>DMARC Compliant</div>
                                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff4d4f' }}>
                                                {authStats?.dmarc_compliant?.percentage || 0}%
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#999' }}>
                                                {authStats?.dmarc_compliant?.count || 0} messages
                                            </div>
                                        </div>
                                    </Card>
                                </Col>
                            </Row>
                        </div>
                    )
                },
                {
                    key: 'hourly',
                    label: 'Hourly Chart',
                    children: (
                        <Card>
                            <ResponsiveContainer width="100%" height={400}>
                                <LineChart data={hourlyData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="timestamp" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="total" stroke="#667eea" name="Total" />
                                    <Line type="monotone" dataKey="sent" stroke="#52c41a" name="Sent" />
                                    <Line type="monotone" dataKey="failed" stroke="#ff4d4f" name="Failed" />
                                </LineChart>
                            </ResponsiveContainer>
                        </Card>
                    )
                },
                {
                    key: 'delivery',
                    label: 'By Domain',
                    children: (
                        <Card>
                            <Table
                                columns={columns}
                                dataSource={deliveryStats}
                                rowKey="domain"
                                pagination={{ pageSize: 10 }}
                            />
                        </Card>
                    )
                }
            ]} />
        </div>
    );
};

export default AnalyticsPage;
