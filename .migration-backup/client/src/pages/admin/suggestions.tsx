import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FlaskConical, ScanLine, Check, X, User, IndianRupee } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface SuggestedLabTest {
  id: string;
  providerId: string;
  testName: string;
  description: string | null;
  suggestedPrice: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  provider?: {
    name: string;
    email: string;
  };
}

interface SuggestedModality {
  id: string;
  providerId: string;
  modalityName: string;
  description: string | null;
  suggestedPrice: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  provider?: {
    name: string;
    email: string;
  };
}

export default function AdminSuggestions() {
  const { toast } = useToast();
  const [adminNotes, setAdminNotes] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewingType, setReviewingType] = useState<"lab" | "modality">("lab");

  const { data: labSuggestions, isLoading: labLoading } = useQuery<SuggestedLabTest[]>({
    queryKey: ["/api/admin/suggested-lab-tests"],
  });

  const { data: modalitySuggestions, isLoading: modalityLoading } = useQuery<SuggestedModality[]>({
    queryKey: ["/api/admin/suggested-modalities"],
  });

  const updateLabStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes: string }) => {
      return apiRequest("PATCH", `/api/admin/suggested-lab-tests/${id}`, { status, adminNotes: notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suggested-lab-tests"] });
      setReviewingId(null);
      setAdminNotes("");
      toast({ title: "Updated", description: "Suggestion status updated." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to update suggestion.", variant: "destructive" });
    },
  });

  const updateModalityStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes: string }) => {
      return apiRequest("PATCH", `/api/admin/suggested-modalities/${id}`, { status, adminNotes: notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suggested-modalities"] });
      setReviewingId(null);
      setAdminNotes("");
      toast({ title: "Updated", description: "Suggestion status updated." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to update suggestion.", variant: "destructive" });
    },
  });

  const handleApprove = (id: string, type: "lab" | "modality") => {
    if (type === "lab") {
      updateLabStatusMutation.mutate({ id, status: "approved", notes: adminNotes });
    } else {
      updateModalityStatusMutation.mutate({ id, status: "approved", notes: adminNotes });
    }
  };

  const handleReject = (id: string, type: "lab" | "modality") => {
    if (type === "lab") {
      updateLabStatusMutation.mutate({ id, status: "rejected", notes: adminNotes });
    } else {
      updateModalityStatusMutation.mutate({ id, status: "rejected", notes: adminNotes });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      case "approved":
        return <Badge variant="default">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingLabCount = labSuggestions?.filter(s => s.status === "pending").length || 0;
  const pendingModalityCount = modalitySuggestions?.filter(s => s.status === "pending").length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Provider Suggestions</h1>
        <p className="text-muted-foreground">Review and approve new tests/modalities suggested by providers</p>
      </div>

      <Tabs defaultValue="labs" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="labs" data-testid="tab-lab-suggestions">
            <FlaskConical className="mr-2 h-4 w-4" />
            Lab Tests {pendingLabCount > 0 && <Badge className="ml-2" variant="secondary">{pendingLabCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="modalities" data-testid="tab-modality-suggestions">
            <ScanLine className="mr-2 h-4 w-4" />
            Modalities {pendingModalityCount > 0 && <Badge className="ml-2" variant="secondary">{pendingModalityCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="labs" className="space-y-4">
          {labLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : !labSuggestions || labSuggestions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No lab test suggestions</h3>
                <p className="text-sm text-muted-foreground">Providers haven't suggested any new tests yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {labSuggestions.map((suggestion) => (
                <Card key={suggestion.id} data-testid={`suggestion-lab-${suggestion.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{suggestion.testName}</h3>
                          {getStatusBadge(suggestion.status)}
                        </div>
                        {suggestion.description && (
                          <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {suggestion.provider?.name || "Unknown Provider"}
                          </span>
                          {suggestion.suggestedPrice && (
                            <span className="flex items-center gap-1">
                              <IndianRupee className="h-3.5 w-3.5" />
                              ₹{suggestion.suggestedPrice}
                            </span>
                          )}
                        </div>
                        {suggestion.adminNotes && (
                          <p className="text-sm text-muted-foreground mt-2 italic">
                            Admin notes: {suggestion.adminNotes}
                          </p>
                        )}
                      </div>
                      {suggestion.status === "pending" && (
                        <div className="flex gap-2">
                          <Dialog open={reviewingId === suggestion.id && reviewingType === "lab"} onOpenChange={(open) => {
                            if (open) {
                              setReviewingId(suggestion.id);
                              setReviewingType("lab");
                              setAdminNotes("");
                            } else {
                              setReviewingId(null);
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" data-testid={`button-review-lab-${suggestion.id}`}>
                                Review
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Review Suggestion: {suggestion.testName}</DialogTitle>
                                <DialogDescription>
                                  Approve to add this test to the catalog, or reject with notes.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <p className="text-sm font-medium mb-1">Test Name</p>
                                  <p>{suggestion.testName}</p>
                                </div>
                                {suggestion.description && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Description</p>
                                    <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium mb-1">Suggested Price</p>
                                  <p>₹{suggestion.suggestedPrice || "Not specified"}</p>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Admin Notes (optional)</label>
                                  <Textarea
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="Add notes for the provider..."
                                    data-testid="input-admin-notes"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    className="flex-1"
                                    onClick={() => handleApprove(suggestion.id, "lab")}
                                    disabled={updateLabStatusMutation.isPending}
                                    data-testid="button-approve-lab"
                                  >
                                    <Check className="mr-2 h-4 w-4" />
                                    Approve
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    className="flex-1"
                                    onClick={() => handleReject(suggestion.id, "lab")}
                                    disabled={updateLabStatusMutation.isPending}
                                    data-testid="button-reject-lab"
                                  >
                                    <X className="mr-2 h-4 w-4" />
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="modalities" className="space-y-4">
          {modalityLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : !modalitySuggestions || modalitySuggestions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ScanLine className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No modality suggestions</h3>
                <p className="text-sm text-muted-foreground">Providers haven't suggested any new modalities yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {modalitySuggestions.map((suggestion) => (
                <Card key={suggestion.id} data-testid={`suggestion-modality-${suggestion.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{suggestion.modalityName}</h3>
                          {getStatusBadge(suggestion.status)}
                        </div>
                        {suggestion.description && (
                          <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {suggestion.provider?.name || "Unknown Provider"}
                          </span>
                          {suggestion.suggestedPrice && (
                            <span className="flex items-center gap-1">
                              <IndianRupee className="h-3.5 w-3.5" />
                              ₹{suggestion.suggestedPrice}
                            </span>
                          )}
                        </div>
                        {suggestion.adminNotes && (
                          <p className="text-sm text-muted-foreground mt-2 italic">
                            Admin notes: {suggestion.adminNotes}
                          </p>
                        )}
                      </div>
                      {suggestion.status === "pending" && (
                        <div className="flex gap-2">
                          <Dialog open={reviewingId === suggestion.id && reviewingType === "modality"} onOpenChange={(open) => {
                            if (open) {
                              setReviewingId(suggestion.id);
                              setReviewingType("modality");
                              setAdminNotes("");
                            } else {
                              setReviewingId(null);
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" data-testid={`button-review-modality-${suggestion.id}`}>
                                Review
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Review Suggestion: {suggestion.modalityName}</DialogTitle>
                                <DialogDescription>
                                  Approve to add this modality to the catalog, or reject with notes.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <p className="text-sm font-medium mb-1">Modality Name</p>
                                  <p>{suggestion.modalityName}</p>
                                </div>
                                {suggestion.description && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Description</p>
                                    <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium mb-1">Suggested Price</p>
                                  <p>₹{suggestion.suggestedPrice || "Not specified"}</p>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Admin Notes (optional)</label>
                                  <Textarea
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="Add notes for the provider..."
                                    data-testid="input-modality-admin-notes"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    className="flex-1"
                                    onClick={() => handleApprove(suggestion.id, "modality")}
                                    disabled={updateModalityStatusMutation.isPending}
                                    data-testid="button-approve-modality"
                                  >
                                    <Check className="mr-2 h-4 w-4" />
                                    Approve
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    className="flex-1"
                                    onClick={() => handleReject(suggestion.id, "modality")}
                                    disabled={updateModalityStatusMutation.isPending}
                                    data-testid="button-reject-modality"
                                  >
                                    <X className="mr-2 h-4 w-4" />
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
