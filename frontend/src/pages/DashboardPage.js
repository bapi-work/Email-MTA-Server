import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, message, Spin } from 'antd';
import { ArrowUpOutlined, MailOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const DashboardPage = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [deliveryData, setDeliveryData] = useState([]);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [statsRes, deliveryRes] = await Promise.all([
                axios.get('/api/v1/analytics/dashboard'),
                axios.get('/api/v1/analytics/delivery-by-domain')
            ]);

            setStats(statsRes.data?.summary);
            setDeliveryData(deliveryRes.data || []);
        } catch (error) {
            message.error('Failed to load dashboard data');
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
            title: 'Failed',
            dataIndex: 'failed',
            key: 'failed'
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
            <h1>Dashboard</h1>
            
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic
                            title="Total Messages"
                            value={stats?.total_messages || 0}
                            prefix={<MailOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic
                            title="Successfully Sent"
                            value={stats?.sent || 0}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic
                            title="Failed"
                            value={stats?.failed || 0}
                            prefix={<CloseCircleOutlined />}
                            valueStyle={{ color: '#ff4d4f' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic
                            title="Success Rate"
                            value={stats?.success_rate || 0}
                            suffix="%"
                            precision={2}
                            valueStyle={{ color: '#667eea' }}
                        />
                    </Card>
                </Col>
            </Row>

            <Card title="Delivery by Domain" style={{ marginBottom: '24px' }}>
                <Table
                    columns={columns}
                    dataSource={deliveryData}
                    rowKey="domain"
                    pagination={{ pageSize: 10 }}
                />
            </Card>
        </div>
    );
};

export default DashboardPage;
