import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Card, Spin, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import axios from 'axios';

const DomainsPage = () => {
    const [loading, setLoading] = useState(true);
    const [domains, setDomains] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        fetchDomains();
    }, []);

    const fetchDomains = async () => {
        try {
            const response = await axios.get('/api/v1/domains/');
            setDomains(response.data || []);
        } catch (error) {
            message.error('Failed to load domains');
        } finally {
            setLoading(false);
        }
    };

    const handleAddDomain = async (values) => {
        try {
            await axios.post('/api/v1/domains/', values);
            message.success('Domain added successfully');
            setIsModalVisible(false);
            form.resetFields();
            fetchDomains();
        } catch (error) {
            message.error(error.response?.data?.detail || 'Failed to add domain');
        }
    };

    const handleDeleteDomain = async (domainId) => {
        Modal.confirm({
            title: 'Delete Domain',
            content: 'Are you sure you want to delete this domain?',
            okText: 'Yes',
            cancelText: 'No',
            onOk: async () => {
                try {
                    await axios.delete(`/api/v1/domains/${domainId}`);
                    message.success('Domain deleted');
                    fetchDomains();
                } catch (error) {
                    message.error('Failed to delete domain');
                }
            }
        });
    };

    const columns = [
        {
            title: 'Domain Name',
            dataIndex: 'domain_name',
            key: 'domain_name'
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status'
        },
        {
            title: 'SPF Verified',
            dataIndex: 'spf_verified',
            key: 'spf_verified',
            render: (text) => text ? 'Yes' : 'No'
        },
        {
            title: 'DKIM Enabled',
            dataIndex: 'dkim_enabled',
            key: 'dkim_enabled',
            render: (text) => text ? 'Yes' : 'No'
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button type="primary" size="small" icon={<EditOutlined />}>Edit</Button>
                    <Button danger size="small" icon={<DeleteOutlined />} onClick={() => handleDeleteDomain(record.id)}>Delete</Button>
                </Space>
            )
        }
    ];

    if (loading) {
        return <Spin size="large" />;
    }

    return (
        <div className="content-wrapper">
            <h1>Domains Management</h1>
            
            <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: '16px' }} onClick={() => setIsModalVisible(true)}>
                Add Domain
            </Button>

            <Card>
                <Table
                    columns={columns}
                    dataSource={domains}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            <Modal
                title="Add New Domain"
                visible={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                footer={null}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleAddDomain}
                >
                    <Form.Item
                        label="Domain Name"
                        name="domain_name"
                        rules={[
                            { required: true, message: 'Please enter domain name' },
                            { pattern: /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, message: 'Invalid domain format' }
                        ]}
                    >
                        <Input placeholder="example.com" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" block htmlType="submit">Add Domain</Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default DomainsPage;
