import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, message, Button, Spin, Space } from 'antd';
import { MailOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const QueuesPage = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        fetchQueueData();
    }, []);

    const fetchQueueData = async () => {
        try {
            const [statsRes, messagesRes] = await Promise.all([
                axios.get('/api/v1/queues/stats'),
                axios.get('/api/v1/queues/messages?limit=20')
            ]);

            setStats(statsRes.data);
            setMessages(messagesRes.data || []);
        } catch (error) {
            message.error('Failed to load queue data');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: 'Message ID',
            dataIndex: 'message_id',
            key: 'message_id',
            width: 200,
            ellipsis: true
        },
        {
            title: 'To',
            dataIndex: 'to_email',
            key: 'to_email'
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status'
        },
        {
            title: 'Attempts',
            dataIndex: 'attempts',
            key: 'attempts'
        }
    ];

    if (loading) {
        return <Spin size="large" />;
    }

    return (
        <div className="content-wrapper">
            <h1>Message Queue</h1>
            
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic title="Total" value={stats?.total_messages || 0} />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic title="Queued" value={stats?.queued || 0} />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic title="Sending" value={stats?.sending || 0} />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic title="Sent" value={stats?.sent || 0} />
                    </Card>
                </Col>
            </Row>

            <Card title="Recent Messages">
                <Table
                    columns={columns}
                    dataSource={messages}
                    rowKey="message_id"
                    pagination={{ pageSize: 10 }}
                />
            </Card>
        </div>
    );
};

export default QueuesPage;
