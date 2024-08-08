import React, {createContext, useContext, useEffect, useState} from 'react';
import axiosInstance from '../modules/AxiosModule';

export const LayoutContext = createContext();

// TODO: Consider using a state management library (like Redux, MobX, or Context API) for global state.
export const LayoutProvider = ({ children }) => {
    const [state, setState] = useState({ theme: 'light' });

    return (
        <LayoutContext.Provider value={[state, setState]}>
            {children}
        </LayoutContext.Provider>
    );
};