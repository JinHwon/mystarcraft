import { useState } from "react";
import { useLocation } from "wouter";
import { Sword, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

type Mode = "login" | "register";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "register" && password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/local/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "요청에 실패했습니다");
        return;
      }
      await utils.auth.me.invalidate();
      navigate("/");
    } catch {
      setError("서버에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
            <Sword className="w-5 h-5 text-primary" />
          </div>
          <CardTitle className="text-xl">마이스타크래프트</CardTitle>
          <CardDescription>아이디로 로그인하거나 새 계정을 만드세요</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={v => { setMode(v as Mode); setError(null); }} className="mb-4">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">로그인</TabsTrigger>
              <TabsTrigger value="register">회원가입</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">아이디</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="영문/숫자/밑줄 3~20자"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="6자 이상"
                required
              />
            </div>
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  required
                />
              </div>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "login" ? "로그인" : "회원가입"}
            </Button>
          </form>
          <Button variant="ghost" className="w-full mt-2 text-muted-foreground" onClick={() => navigate("/")}>
            처음으로
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
