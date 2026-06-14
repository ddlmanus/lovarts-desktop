import { useNavigate, useParams as useRouterParams } from "react-router-dom";

export function useRouter() {
  const navigate = useNavigate();

  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => window.location.reload(),
  };
}

export function useParams() {
  return useRouterParams();
}

export function usePathname() {
  return window.location.hash.replace(/^#/, "") || window.location.pathname;
}
