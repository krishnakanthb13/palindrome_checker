const baseProps = {
    viewBox: '0 0 24 24',
    width: '1em',
    height: '1em',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
};

function Icon({ children, ...props }) {
    return (
        <svg {...baseProps} {...props}>
            {children}
        </svg>
    );
}

export function LogoIcon(props) {
    return (
        <Icon {...props}>
            <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
            <path d="M7.5 12h9" />
            <path d="m10 9.5-2.5 2.5 2.5 2.5" />
            <path d="m14 9.5 2.5 2.5-2.5 2.5" />
        </Icon>
    );
}

export function FileIcon(props) {
    return (
        <Icon {...props}>
            <path d="M14 2.75H6.5A2.25 2.25 0 0 0 4.25 5v14a2.25 2.25 0 0 0 2.25 2.25h11A2.25 2.25 0 0 0 19.75 19V8.5Z" />
            <path d="M14 2.75V8.5h5.75" />
            <path d="M8.5 12.5h7" />
            <path d="M8.5 16h4.5" />
        </Icon>
    );
}

export function RefreshIcon(props) {
    return (
        <Icon {...props}>
            <path d="M20.75 12a8.75 8.75 0 1 1-2.57-6.19" />
            <path d="M20.75 3.5v6h-6" />
        </Icon>
    );
}

export function TargetIcon(props) {
    return (
        <Icon {...props}>
            <circle cx="12" cy="12" r="7.25" />
            <circle cx="12" cy="12" r="2" />
            <path d="M12 2.75v3" />
            <path d="M12 18.25v3" />
            <path d="M2.75 12h3" />
            <path d="M18.25 12h3" />
        </Icon>
    );
}

export function SearchIcon(props) {
    return (
        <Icon {...props}>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
        </Icon>
    );
}

export function CloseIcon(props) {
    return (
        <Icon {...props}>
            <path d="m6 6 12 12" />
            <path d="M18 6 6 18" />
        </Icon>
    );
}

export function AlertIcon(props) {
    return (
        <Icon {...props}>
            <path d="M12 3 22 20H2Z" />
            <path d="M12 9v4.5" />
            <path d="M12 17h.01" />
        </Icon>
    );
}

export function CheckIcon(props) {
    return (
        <Icon {...props}>
            <circle cx="12" cy="12" r="8.75" />
            <path d="m8.5 12 2.5 2.5 4.5-5" />
        </Icon>
    );
}

export function DatabaseIcon(props) {
    return (
        <Icon {...props}>
            <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
            <path d="M4.5 5.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
            <path d="M4.5 11.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
        </Icon>
    );
}

export function ArrowRightLeftIcon(props) {
    return (
        <Icon {...props}>
            <path d="M3.5 7.5h17" />
            <path d="m17 4 3.5 3.5L17 11" />
            <path d="M20.5 16.5h-17" />
            <path d="m7 13-3.5 3.5L7 20" />
        </Icon>
    );
}

export function ServerIcon(props) {
    return (
        <Icon {...props}>
            <rect x="3" y="4" width="18" height="7" rx="2" />
            <rect x="3" y="13" width="18" height="7" rx="2" />
            <path d="M7 7.5h.01" />
            <path d="M7 16.5h.01" />
        </Icon>
    );
}
