import React from 'react';
import { useLocation } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminOverview from './AdminOverview';
import UsersTable from './UsersTable';
import AppointmentsMonitor from './AppointmentsMonitor';
import StockView from './StockView';
import ReportsView from './ReportsView';

const AdminDashboard = () => {
    const location = useLocation();
    const path = location.pathname.split('/').pop();

    const renderContent = () => {
        switch (path) {
            case 'users': return <UsersTable />;
            case 'appointments': return <AppointmentsMonitor />;
            case 'stock': return <StockView />;
            case 'reports': return <ReportsView />;
            case 'dashboard':
            default: return <AdminOverview />;
        }
    };

    return (
        <div className="flex min-h-screen bg-gray-50">
            <AdminSidebar />

            <main className="flex-1 ml-0 md:ml-20 lg:ml-64 p-6 md:p-8">
                {renderContent()}
            </main>
        </div>
    );
};

export default AdminDashboard;
