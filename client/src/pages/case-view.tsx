import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ChevronLeft, Save, Trash2, Lock, FileWarning } from "lucide-react";

const caseSchema = z.object({
  title: z.string().min(1, "Title required"),
  description: z.string().min(1, "Description required"),
  status: z.enum(["Active", "Closed", "Redacted"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  content: z.string(),
});

export default function CaseView() {
  const [, params] = useRoute("/cases/:id");
  const [, setLocation] = useLocation();
  const { cases, user, createCase, updateCase, deleteCase } = useAuth();
  
  const isNew = params?.id === "new";
  const existingCase = cases.find(c => c.id === params?.id);
  
  const [isEditing, setIsEditing] = useState(isNew);

  // Permission Checks
  const canEdit = user?.role === "Management" || user?.role === "Overseer" || (user?.role === "Agent" && existingCase?.assignedAgent === user?.username) || isNew;
  const canDelete = user?.role === "Management" || user?.role === "Overseer";

  const form = useForm<z.infer<typeof caseSchema>>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      title: existingCase?.title || "",
      description: existingCase?.description || "",
      status: (existingCase?.status as any) || "Active",
      priority: (existingCase?.priority as any) || "Medium",
      content: existingCase?.content || "",
    },
  });

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
    if (existingCase && confirm("CONFIRM DELETION: This action cannot be undone.")) {
      deleteCase(existingCase.id);
      setLocation("/dashboard");
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
            <h1 className="font-mono text-2xl font-bold tracking-tight">
              {isNew ? "NEW_CASE_FILE" : existingCase?.id}
            </h1>
            {!isNew && (
              <p className="font-mono text-xs text-muted-foreground">
                LAST UPDATE: {new Date(existingCase!.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {!isNew && !isEditing && canEdit && (
            <Button variant="outline" className="font-mono" onClick={() => setIsEditing(true)}>
              EDIT RECORD
            </Button>
          )}
          
          {!isNew && canDelete && (
            <Button variant="destructive" size="icon" onClick={handleDelete}>
              <Trash2 size={18} />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
           <div className="flex items-center gap-2 mb-2">
             <Lock className="h-4 w-4 text-primary" />
             <span className="font-mono text-xs text-primary tracking-widest uppercase">Classified Document</span>
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
