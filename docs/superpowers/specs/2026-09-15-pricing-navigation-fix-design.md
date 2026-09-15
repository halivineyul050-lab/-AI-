# Pricing Page Navigation Fix Design

The standalone video pricing page will use the same site header, primary navigation links, theme control, and responsive menu behavior as the utility pages. “视频模型价格” is the current navigation item. The pricing hero also contains a visible “返回泥壳AI工具站” link to `/`, so users have an explicit route back even without opening the navigation menu.

The page will load the shared site and utility navigation styles. Its existing body padding moves to the pricing container so the global header spans the viewport. Automated coverage will assert the header, current-page state, home return link, and shared responsive navigation assets. Desktop and mobile browser checks will confirm no horizontal page overflow and a working collapsed menu.
