import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center shadow-2xl border-2">
        <CardContent className="pt-6">
          <div className="mb-4 flex justify-center text-orange-500">
            <AlertTriangle className="h-16 w-16" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
          <p className="mt-2 text-muted-foreground mb-6">
            The page you are looking for does not exist.
          </p>
          <Link href="/">
            <Button className="w-full">Return to Dashboard</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
