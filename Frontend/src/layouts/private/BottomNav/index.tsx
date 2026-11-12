import { Link } from 'react-router';
import { useNavItems } from '../nav';

/** Thanh điều hướng dưới đáy màn hình trên mobile: chỉ icon, tên mục nằm ở aria-label/title. */
export const AppBottomNav = () => {
    const { items, activePath } = useNavItems();

    return (
        <nav className="app-bottom-nav" aria-label="Điều hướng chính">
            {items.map((item) => {
                if (!item.path) return null;
                const active = item.path === activePath;
                return (
                    <Link
                        key={item.key}
                        to={item.path}
                        className="app-bottom-nav-item"
                        data-active={active}
                        aria-label={item.label}
                        aria-current={active ? 'page' : undefined}
                        title={item.label}
                    >
                        {item.icon}
                    </Link>
                );
            })}
        </nav>
    );
};

export default AppBottomNav;
