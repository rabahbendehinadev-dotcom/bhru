import { createContext, useContext } from 'react';

// Supplied by the server at runtime, never a VITE_* build constant.
export const AdminEntryContext = createContext('');
export const useAdminPath = () => useContext(AdminEntryContext);