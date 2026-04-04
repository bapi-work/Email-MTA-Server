import React, { useState, useEffect } from 'react';
import { Table, Button, message, Card, Spin, Space } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const UsersPage = () => {
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/api/v1/users/');
            setUsers(response.data || []);
        } catch (error) {
            message.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username'
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email'
        },
        {
            title: 'Full Name',
            dataIndex: 'full_name',
            key: 'full_name'
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role'
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (text) => text ? 'Active' : 'Inactive'
        }
    ];

    if (loading) {
        return <Spin size="large" />;
    }

    return (
        <div className="content-wrapper">
            <h1>Users Management</h1>
            
            <Card>
                <Table
                    columns={columns}
                    dataSource={users}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                />
            </Card>
        </div>
    );
};

export default UsersPage;
