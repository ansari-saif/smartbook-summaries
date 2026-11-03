import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="cloth flex min-h-[100dvh] items-center justify-center px-6">
      <div className="text-center">
        <span className="headband mx-auto block h-1.5 w-20 rounded-full" aria-hidden />
        <h1 className="foil mt-5 text-2xl font-medium">Not on the shelf</h1>
        <p className="mt-3 font-read text-lg text-paper-muted">
          There is no page at {location.pathname}.
        </p>
        <Link to="/" className="foil-plate mt-8 h-12 px-8">
          Go to the shelf
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
