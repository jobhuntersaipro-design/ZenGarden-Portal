import { AppSplash } from "@/components/portal/AppSplash";

/**
 * The root boundary: it sits above every route group's layout, so it is what
 * paints while one of them is still awaiting the session. Within a group the
 * group's own skeletons take over, because its layout is already on screen.
 */
export default function RootLoading() {
  return <AppSplash />;
}
