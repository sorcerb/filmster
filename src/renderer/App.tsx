import Navbar from './layout/Navbar';
import { Route, HashRouter, Routes, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Files from './pages/Files';
import News from './pages/News';
import Settings from './pages/Settings';
import Home from './pages/Home';
import Profile from './pages/Profile';
import MediaDetails from './pages/MediaDetails';
import Player from './pages/Player';
import { latinToCyrillic } from './utils/transliteration';

const ScrollToTop = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return null;
};

const MainLayout = () => (
    <>
        <ScrollToTop />
        <Navbar />
        <div className="px-3 md:px-6 py-2 mt-12">
            <Outlet />
        </div>
    </>
);

function App() {
    useEffect(() => {
        const handleConvertToCyrillic = (text: string) => {
            const activeElement = document.activeElement;
            const selection = window.getSelection();
            
            if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
                const start = activeElement.selectionStart ?? 0;
                const end = activeElement.selectionEnd ?? 0;
                const value = activeElement.value;
                const converted = latinToCyrillic(text);
                const newValue = value.substring(0, start) + converted + value.substring(end);
                
                const fiberKey = Object.keys(activeElement).find(key => key.startsWith('__reactFiber'));
                if (fiberKey) {
                    const fiber = (activeElement as any)[fiberKey];
                    if (fiber && fiber.memoizedProps && fiber.memoizedProps.onChange) {
                        fiber.memoizedProps.onChange({ target: { value: newValue } });
                    }
                }
                
                const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(activeElement), 'value')?.set;
                if (nativeSetter) {
                    nativeSetter.call(activeElement, newValue);
                } else {
                    activeElement.value = newValue;
                }
                
                activeElement.selectionStart = activeElement.selectionEnd = start + converted.length;
            } else if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const converted = latinToCyrillic(text);
                range.deleteContents();
                range.insertNode(document.createTextNode(converted));
            }
        };

        window.electron?.onConvertToCyrillic?.(handleConvertToCyrillic);

        return () => {
            window.electron?.removeConvertListener?.();
        };
    }, []);

    return (
        <div className="overflow-hidden">
            <HashRouter>
                <Routes>
                    <Route element={<MainLayout />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/news" element={<News />} />
                        <Route path="/files" element={<Files />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/media/:id" element={<MediaDetails />} />
                    </Route>
                    <Route path="/play/:id" element={<div className="h-dvh"><Player /></div>} />
                </Routes>
            </HashRouter>
        </div>
    )
}


export default App;