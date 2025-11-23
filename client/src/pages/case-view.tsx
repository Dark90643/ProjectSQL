import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Save, Trash2, Lock, FileWarning, Globe } from "lucide-react";

const caseSchema = z.object({
  title: z.string().min(1, "Title required"),
  description: z.string().min(1, "Description required"),
  status: z.enum(["Active", "Closed", "Redacted"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  content: z.string(),
  googleDocUrl: z.string().optional(),
});

export default function CaseView() {
  const [, params] = useRoute("/cases/:id");
  const [, setLocation] = useLocation();
  const { cases, user, createCase, updateCase, deleteCase, toggleCasePublic, currentServerId } = useAuth();
  const { toast } = useToast();
  
  const isNew = params?.id === "new";
  const contextCase = cases.find(c => c.id === params?.id);
  const [liveCase, setLiveCase] = useState<any>(null);
  const [isLoadingCase, setIsLoadingCase] = useState(!isNew);
  const [hasCreatePermission, setHasCreatePermission] = useState<boolean | null>(null);
  
  const [isEditing, setIsEditing] = useState(isNew);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Check create permissions for new cases
  useEffect(() => {
    if (isNew) {
      // Check if user has Agent, Management, or Overseer role
      const hasPermission = user && ["Agent", "Management", "Overseer"].includes(user.role);
      setHasCreatePermission(hasPermission || false);
      
      if (!hasPermission) {
        // Redirect if no permission
        setTimeout(() => {
          setLocation("/dashboard");
          toast({ variant: "destructive", title: "Access Denied", description: "Only authorized users can create cases" });
        }, 100);
      }
    }
  }, [isNew, user, setLocation, toast]);

  // Fetch fresh case data on mount and when case ID changes
  useEffect(() => {
    if (!isNew && params?.id) {
      setIsLoadingCase(true);
      fetch(`/api/cases/${params.id}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          setLiveCase(data);
          setNeedsPassword(data?.caseCode ? true : false);
          setIsLoadingCase(false);
        })
        .catch(err => {
          console.error("Error fetching case:", err);
          setIsLoadingCase(false);
        });
    } else {
      setLiveCase(contextCase);
      setIsLoadingCase(false);
    }
  }, [params?.id, isNew, contextCase]);

  const existingCase = liveCase || contextCase;

  // Permission Checks
  const canEdit = isNew ? (hasCreatePermission === true) : (user && ["Agent", "Management", "Overseer"].includes(user.role));
  const canDelete = user?.role === "Management" || user?.role === "Overseer";
  const isOverseer = user?.role === "Overseer";

  const form = useForm<z.infer<typeof caseSchema>>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "Active",
      priority: "Medium",
      content: "",
      googleDocUrl: "",
    },
  });

  // Reset form when existingCase changes
  useEffect(() => {
    if (existingCase) {
      form.reset({
        title: existingCase.title || "",
        description: existingCase.description || "",
        status: (existingCase.status as any) || "Active",
        priority: (existingCase.priority as any) || "Medium",
        content: existingCase.content || "",
        googleDocUrl: existingCase.googleDocUrl || "",
      });
    }
  }, [existingCase?.id, form]);

  // Password verification for encrypted cases
  const verifyPassword = () => {
    if (!existingCase?.caseCode) {
      setNeedsPassword(false);
      return;
    }
    
    if (passwordInput === existingCase.caseCode) {
      setNeedsPassword(false);
      setPasswordInput("");
    } else {
      toast({ variant: "destructive", title: "Access Denied", description: "Incorrect encryption code" });
      setPasswordInput("");
    }
  };

  // Show loading state while checking permissions or loading case
  if (isLoadingCase || (isNew && hasCreatePermission === null)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="h-12 w-12 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="font-mono text-xs text-muted-foreground">{isNew ? "CHECKING PERMISSIONS..." : "LOADING CASE FILE..."}</p>
      </div>
    );
  }

  // Redirect if trying to create case without permission
  if (isNew && hasCreatePermission === false) {
    return null;
  }

  // Redirect if case not found and not creating new
  if (!isNew && !existingCase) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <FileWarning className="h-16 w-16 text-destructive opacity-50" />
        <h2 className="font-mono text-xl">FILE NOT FOUND</h2>
        <Button onClick={() => setLocation("/dashboard")} variant="outline" className="font-mono">
          RETURN TO DASHBOARD
        </Button>
      </div>
    );
  }

  // Show password prompt if case is encrypted - BEFORE rendering any content
  if (!isNew && needsPassword && (existingCase as any)?.caseCode) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <Lock className="h-16 w-16 text-destructive opacity-50" />
        <h2 className="font-mono text-xl">ENCRYPTED_FILE_ACCESS</h2>
        <p className="font-mono text-xs text-muted-foreground">Enter encryption code to continue</p>
        <Input 
          type="password" 
          placeholder="ENTER CODE" 
          className="font-mono w-64 bg-black/40"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && verifyPassword()}
          data-testid="input-case-password"
        />
        <div className="flex gap-2">
          <Button onClick={() => setLocation("/dashboard")} variant="outline" className="font-mono">
            CANCEL
          </Button>
          <Button onClick={verifyPassword} className="font-mono" data-testid="button-verify-case-code">
            VERIFY ACCESS
          </Button>
        </div>
      </div>
    );
  }

  const onSubmit = (values: z.infer<typeof caseSchema>) => {
    if (isNew) {
      createCase({
        ...values,
        tags: [], // Basic implementation
      });
      setLocation("/dashboard");
    } else if (existingCase) {
      updateCase(existingCase.id, values);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (existingCase) {
      deleteCase(existingCase.id);
      setLocation("/dashboard");
    }
  };

  const handleEncryptCase = async () => {
    if (!existingCase) return;
    try {
      const response = await fetch(`/api/cases/${existingCase.id}/encrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast({ variant: "destructive", title: "Error", description: error.error });
        return;
      }

      const { caseCode } = await response.json();
      toast({ title: "Success", description: `Case encrypted with code: ${caseCode}` });
      setLiveCase({ ...existingCase, caseCode });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to encrypt case" });
    }
  };

  const handleDecryptCase = async () => {
    if (!existingCase) return;
    try {
      const response = await fetch(`/api/cases/${existingCase.id}/decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast({ variant: "destructive", title: "Error", description: error.error });
        return;
      }

      toast({ title: "Success", description: "Case encryption removed" });
      setLiveCase({ ...existingCase, caseCode: null });
      setNeedsPassword(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to decrypt case" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
            <ChevronLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-bold tracking-tight">
                {isNew ? "NEW_CASE_FILE" : existingCase?.id}
              </h1>
              {!isNew && existingCase?.isPublic && (
                 <div className="flex items-center gap-1 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-mono">
                   <Globe size={10} /> PUBLIC
                 </div>
              )}
            </div>
            {!isNew && (
              <p className="font-mono text-xs text-muted-foreground">
                LAST UPDATE: {new Date(existingCase!.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {!isNew && isOverseer && (
             <Button 
               variant="outline" 
               className={`font-mono gap-2 ${existingCase?.isPublic ? "text-primary border-primary" : ""}`}
               onClick={() => toggleCasePublic(existingCase!.id)}
             >
               {existingCase?.isPublic ? <Lock size={14} /> : <Globe size={14} />}
               {existingCase?.isPublic ? "MAKE PRIVATE" : "MAKE PUBLIC"}
             </Button>
          )}

          {!isNew && (user?.role === "Management" || user?.role === "Overseer") && (
            <>
              {(existingCase as any)?.caseCode ? (
                <Button variant="outline" className="font-mono gap-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleDecryptCase}>
                  <Lock size={14} />
                  DECRYPT
                </Button>
              ) : (
                <Button variant="outline" className="font-mono gap-2 text-primary border-primary/30 hover:bg-primary/10" onClick={handleEncryptCase}>
                  <Lock size={14} />
                  ENCRYPT
                </Button>
              )}
            </>
          )}

          {!isNew && !isEditing && canEdit && (
            <Button variant="outline" className="font-mono" onClick={() => setIsEditing(true)}>
              EDIT RECORD
            </Button>
          )}
          
          {!isNew && canDelete && (
            <Button 
              variant={confirmDelete ? "destructive" : "outline"} 
              size={confirmDelete ? "default" : "icon"} 
              onClick={handleDelete}
              className={confirmDelete ? "font-mono gap-2 text-destructive border-destructive" : ""}
            >
              {confirmDelete ? (
                <>
                  <Trash2 size={14} />
                  CONFIRM DELETE?
                </>
              ) : (
                <Trash2 size={18} />
              )}
            </Button>
          )}
          {confirmDelete && (
            <Button 
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              className="font-mono text-xs"
            >
              CANCEL
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
           <div className="flex items-center justify-between mb-2">
             <div className="flex items-center gap-2">
               <Lock className="h-4 w-4 text-primary" />
               <span className="font-mono text-xs text-primary tracking-widest uppercase">Classified Document</span>
             </div>
           </div>
           <div className="h-px w-full bg-gradient-to-r from-primary/50 to-transparent" />
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Subject</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono bg-background/50" placeholder="CASE SUBJECT" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Priority</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="font-mono bg-background/50">
                                <SelectValue placeholder="Select Priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Low">Low</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="High">High</SelectItem>
                              <SelectItem value="Critical">Critical</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="font-mono bg-background/50">
                                <SelectValue placeholder="Select Status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Closed">Closed</SelectItem>
                              <SelectItem value="Redacted">Redacted</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Briefing</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono bg-background/50" placeholder="Short summary" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="googleDocUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Google Doc URL (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono bg-background/50" placeholder="https://docs.google.com/document/d/..." data-testid="input-google-doc-url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Detailed Intelligence</FormLabel>
                      <FormControl>
                        <Textarea {...field} className="font-mono bg-background/50 min-h-[300px]" placeholder="Full case details..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                   {!isNew && (
                     <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} className="font-mono">
                       CANCEL
                     </Button>
                   )}
                   <Button type="submit" className="font-mono bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                     <Save size={16} />
                     SAVE RECORD
                   </Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="font-mono text-xs text-muted-foreground uppercase mb-1">Subject</p>
                  <p className="font-mono text-lg font-bold">{existingCase?.title}</p>
                </div>
                <div className="flex gap-6">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground uppercase mb-1">Priority</p>
                    <span className={`font-mono px-2 py-1 rounded text-xs border ${
                      existingCase?.priority === "Critical" ? "border-destructive text-destructive" : 
                      existingCase?.priority === "High" ? "border-orange-500 text-orange-500" : "border-primary text-primary"
                    }`}>
                      {existingCase?.priority.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-mono text-xs text-muted-foreground uppercase mb-1">Status</p>
                    <span className="font-mono px-2 py-1 rounded text-xs border border-muted-foreground text-muted-foreground">
                      {existingCase?.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <p className="font-mono text-xs text-muted-foreground uppercase mb-1">Briefing</p>
                <p className="text-sm">{existingCase?.description}</p>
              </div>

              <div className="border-t border-dashed border-primary/20 my-6" />

              {existingCase?.googleDocUrl && (
                <div className="space-y-4">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground uppercase mb-4">Case File (Google Doc)</p>
                    <div className="rounded border border-primary/20 overflow-hidden bg-black/20" data-testid="google-doc-embed">
                      <iframe
                        src={existingCase.googleDocUrl.replace('/edit', '/preview')}
                        className="w-full h-[600px] border-0"
                        allow="fullscreen"
                      />
                    </div>
                  </div>
                  <div className="border-t border-dashed border-primary/20" />
                </div>
              )}

              <div className="prose prose-invert max-w-none">
                <p className="font-mono text-xs text-muted-foreground uppercase mb-4">Full Report</p>
                <div className="font-mono text-sm whitespace-pre-wrap bg-black/20 p-6 rounded border border-white/5">
                  {existingCase?.status === "Redacted" && user?.role !== "Overseer" 
                    ? <span className="text-muted-foreground">[REDACTED CONTENT - CLEARANCE INSUFFICIENT]</span> 
                    : existingCase?.content}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
