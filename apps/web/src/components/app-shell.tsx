"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, UserButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardList,
  FileBarChart2,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Shield,
} from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/tests", label: "Tests", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: FileBarChart2 },
] as const;

function crumbLabel(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/chat")) return "Chat";
  if (pathname.startsWith("/library")) return "Library";
  if (pathname.startsWith("/tests")) return "Tests";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/onboarding")) return "Onboarding";
  return "App";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const adminMe = useQuery({
    ...trpc.admin.me.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
  const isAdmin = Boolean(adminMe.data?.role === "admin");

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="icon"
        className="border-slate-200 dark:border-slate-800"
      >
        <SidebarHeader className="border-b border-slate-200 dark:border-slate-800">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                render={<Link href="/dashboard" />}
              >
                <span className="flex size-8 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
                  E
                </span>
                <span className="font-semibold tracking-tight">ExamGPT</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Study</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                {isAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname.startsWith("/admin")}
                      tooltip="Admin"
                      render={<Link href="/admin" />}
                    >
                      <Shield />
                      <span>Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-slate-200 dark:border-slate-800">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                tooltip="Privacy"
                render={<Link href="/privacy" />}
              >
                <span className="text-xs">Privacy</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                tooltip="Terms"
                render={<Link href="/terms" />}
              >
                <span className="text-xs">Terms</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-slate-50 dark:bg-slate-950">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-950">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/dashboard">ExamGPT</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{crumbLabel(pathname)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "size-8",
                },
              }}
            >
              <UserButton.MenuItems>
                <UserButton.Link
                  label="Privacy"
                  labelIcon={<FileText className="size-4" />}
                  href="/privacy"
                />
                <UserButton.Link
                  label="Terms"
                  labelIcon={<FileText className="size-4" />}
                  href="/terms"
                />
              </UserButton.MenuItems>
            </UserButton>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
