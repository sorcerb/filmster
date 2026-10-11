import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// The page keeps its content clear of it (at least 3rem of left padding).
const BackEdgeButton = ({ label }: { label: string }) => {
    const navigate = useNavigate();

    return (
        <button
            onClick={() => navigate(-1)}
            title={label}
            aria-label={label}
            className="group fixed left-0 top-12 bottom-0 z-10 w-12 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
        >
            <ArrowLeft className="h-6 w-6 group-hover:-translate-x-0.5 transition-transform" />
        </button>
    );
};

export default BackEdgeButton;
